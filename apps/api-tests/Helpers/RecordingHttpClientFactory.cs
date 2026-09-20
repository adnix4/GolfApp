using System.Net;
using System.Text;

namespace WebAPI.Tests.Helpers;

/// <summary>
/// An IHttpClientFactory whose clients never reach the network: every request is
/// captured and answered from a canned response.
///
/// Distinct from <see cref="NullHttpClientFactory"/>, which hands back a real
/// HttpClient — fine for a collaborator that is never exercised, useless for
/// asserting on what was actually sent (and it would genuinely try to reach
/// exp.host if a test ever seeded a push token).
/// </summary>
public sealed class RecordingHttpClientFactory : IHttpClientFactory
{
    private readonly RecordingHandler _handler;

    public RecordingHttpClientFactory(HttpStatusCode status = HttpStatusCode.OK)
        => _handler = new RecordingHandler(status);

    /// <summary>Bodies of every request made through this factory, in order.</summary>
    public IReadOnlyList<string> Bodies => _handler.Bodies;

    /// <summary>Absolute URIs requested, in order.</summary>
    public IReadOnlyList<string> Uris => _handler.Uris;

    public int RequestCount => _handler.Bodies.Count;

    public HttpClient CreateClient(string name) => new(_handler, disposeHandler: false);

    private sealed class RecordingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        private readonly List<string> _bodies = [];
        private readonly List<string> _uris   = [];
        private readonly object _gate = new();

        public IReadOnlyList<string> Bodies => _bodies;
        public IReadOnlyList<string> Uris   => _uris;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);

            lock (_gate)
            {
                _bodies.Add(body);
                _uris.Add(request.RequestUri?.ToString() ?? string.Empty);
            }

            return new HttpResponseMessage(status)
            {
                Content = new StringContent("{\"data\":[]}", Encoding.UTF8, "application/json"),
            };
        }
    }
}
