//! Watch-only HTTP limits that preserve quiet, long-lived response bodies.

use std::{
    error::Error,
    fmt,
    future::Future,
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};

use bytes::Bytes;
use http::{Request, Response};
use http_body::{Body as HttpBody, Frame, SizeHint};
use kube::client::Body;
use tower::{BoxError, Layer, Service};

use super::watch::MAX_WATCH_EVENT_BYTES;

const BODY_FRAME_CHUNK: usize = 64 * 1024;

/// Wraps the kube transport with a response-header deadline and watch-event size guard.
#[derive(Clone, Copy, Debug)]
pub(super) struct WatchResponseLimitLayer {
    response_deadline: Duration,
}

impl WatchResponseLimitLayer {
    pub(super) const fn new(response_deadline: Duration) -> Self {
        Self { response_deadline }
    }
}

impl<S> Layer<S> for WatchResponseLimitLayer {
    type Service = WatchResponseLimitService<S>;

    fn layer(&self, service: S) -> Self::Service {
        WatchResponseLimitService {
            inner: service,
            response_deadline: self.response_deadline,
        }
    }
}

/// A Tower service that times out through response headers, then limits each watch line.
#[derive(Clone, Debug)]
pub(super) struct WatchResponseLimitService<S> {
    inner: S,
    response_deadline: Duration,
}

impl<S, B> Service<Request<Body>> for WatchResponseLimitService<S>
where
    S: Service<Request<Body>, Response = Response<B>> + Send + 'static,
    S::Future: Send + 'static,
    S::Error: Into<BoxError> + 'static,
    B: HttpBody<Data = Bytes> + Send + 'static,
    B::Error: Into<BoxError> + Send + Sync + 'static,
{
    type Response = Response<WatchResponseBody<B>>;
    type Error = BoxError;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, context: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(context).map_err(Into::into)
    }

    fn call(&mut self, request: Request<Body>) -> Self::Future {
        let is_watch = is_watch_request(&request);
        let deadline = self.response_deadline;
        let request = self.inner.call(request);
        Box::pin(async move {
            let response = tokio::time::timeout(deadline, request)
                .await
                .map_err(|_| Box::new(ResponseEstablishmentTimeout) as BoxError)?
                .map_err(Into::into)?;
            Ok(response.map(|body| WatchResponseBody::new(body, is_watch)))
        })
    }
}

fn is_watch_request(request: &Request<Body>) -> bool {
    request
        .uri()
        .query()
        .is_some_and(|query| query.split('&').any(|item| item == "watch=true"))
}

/// Body wrapper that bounds watch JSON lines before kube's decoder receives them.
#[derive(Debug)]
pub(super) struct WatchResponseBody<B> {
    inner: Pin<Box<B>>,
    watch: bool,
    line_bytes: usize,
    pending: Option<Bytes>,
}

impl<B> WatchResponseBody<B> {
    fn new(inner: B, watch: bool) -> Self {
        Self {
            inner: Box::pin(inner),
            watch,
            line_bytes: 0,
            pending: None,
        }
    }
}

impl<B> HttpBody for WatchResponseBody<B>
where
    B: HttpBody<Data = Bytes>,
    B::Error: Into<BoxError> + Send + Sync + 'static,
{
    type Data = Bytes;
    type Error = WatchResponseBodyError;

    fn poll_frame(
        self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        let this = self.get_mut();
        if let Some(data) = this.pending.take() {
            let end = BODY_FRAME_CHUNK.min(data.len());
            if end < data.len() {
                this.pending = Some(data.slice(end..));
            }
            return Poll::Ready(Some(Ok(Frame::data(data.slice(..end)))));
        }

        match this.inner.as_mut().poll_frame(context) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Ready(Some(Err(error))) => {
                Poll::Ready(Some(Err(WatchResponseBodyError::Inner(error.into()))))
            }
            Poll::Ready(Some(Ok(frame))) => {
                if this.watch
                    && let Some(data) = frame.data_ref()
                    && !this.scan_event_lines(data)
                {
                    return Poll::Ready(Some(Err(WatchResponseBodyError::EventTooLarge)));
                }
                if this.watch
                    && let Some(data) = frame.data_ref()
                    && data.len() > BODY_FRAME_CHUNK
                {
                    let data = data.clone();
                    this.pending = Some(data.slice(BODY_FRAME_CHUNK..));
                    return Poll::Ready(Some(Ok(Frame::data(data.slice(..BODY_FRAME_CHUNK)))));
                }
                Poll::Ready(Some(Ok(frame)))
            }
        }
    }

    fn is_end_stream(&self) -> bool {
        self.pending.is_none() && self.inner.as_ref().get_ref().is_end_stream()
    }

    fn size_hint(&self) -> SizeHint {
        let mut hint = self.inner.as_ref().get_ref().size_hint();
        let pending = self.pending.as_ref().map_or(0, Bytes::len) as u64;
        if pending > 0 {
            hint.set_lower(hint.lower().saturating_add(pending));
            if let Some(upper) = hint.upper() {
                hint.set_upper(upper.saturating_add(pending));
            }
        }
        hint
    }
}

impl<B> WatchResponseBody<B>
where
    B: HttpBody<Data = Bytes>,
{
    fn scan_event_lines(&mut self, data: &Bytes) -> bool {
        for byte in data.iter() {
            if *byte == b'\n' {
                self.line_bytes = 0;
            } else {
                let Some(next) = self.line_bytes.checked_add(1) else {
                    return false;
                };
                if next > MAX_WATCH_EVENT_BYTES {
                    return false;
                }
                self.line_bytes = next;
            }
        }
        true
    }
}

#[derive(Debug)]
/// Safe marker distinguishing an oversized event from an underlying body failure.
pub(super) enum WatchResponseBodyError {
    /// The underlying API response stream failed.
    Inner(BoxError),
    /// A line exceeded the accepted serialized event size.
    EventTooLarge,
}

impl fmt::Display for WatchResponseBodyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Inner(_) => formatter.write_str("Kubernetes watch response body failed"),
            Self::EventTooLarge => {
                formatter.write_str("Kubernetes watch event exceeded its size limit")
            }
        }
    }
}

impl Error for WatchResponseBodyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Inner(error) => Some(error.as_ref()),
            Self::EventTooLarge => Some(&WATCH_EVENT_TOO_LARGE),
        }
    }
}

#[derive(Debug)]
struct WatchEventTooLarge;

static WATCH_EVENT_TOO_LARGE: WatchEventTooLarge = WatchEventTooLarge;

impl fmt::Display for WatchEventTooLarge {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Kubernetes watch event exceeded its size limit")
    }
}

impl Error for WatchEventTooLarge {}

#[derive(Debug)]
struct ResponseEstablishmentTimeout;

impl fmt::Display for ResponseEstablishmentTimeout {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Kubernetes API response headers exceeded the deadline")
    }
}

impl Error for ResponseEstablishmentTimeout {}

/// Reports whether an SDK error chain carries the watch-line size marker.
pub(super) fn is_watch_event_too_large(error: &(dyn Error + 'static)) -> bool {
    let mut current = Some(error);
    while let Some(cause) = current {
        if cause.downcast_ref::<WatchEventTooLarge>().is_some() {
            return true;
        }
        current = cause.source();
    }
    false
}
