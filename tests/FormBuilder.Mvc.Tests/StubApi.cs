using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;

namespace FormBuilder.Mvc.Tests;

/// <summary>Stands in for form-builder-api: answers the login call and records every request.</summary>
public sealed class StubApi : HttpMessageHandler
{
    public ConcurrentQueue<RecordedRequest> Requests { get; } = new();

    /// <summary>Answer for any call other than login. Default: 200 with an empty JSON array.</summary>
    public Func<HttpRequestMessage, HttpResponseMessage> Responder { get; set; } = _ => Json(HttpStatusCode.OK, "[]");

    public bool Down { get; set; }

    public sealed record RecordedRequest(HttpMethod Method, string Path, string? Authorization, string? Body);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Enqueue(new RecordedRequest(request.Method, request.RequestUri!.AbsolutePath, request.Headers.Authorization?.ToString(), body));

        if (Down)
            throw new HttpRequestException("Connection refused");

        if (request.RequestUri.AbsolutePath == "/api/auth/login")
            return Login(JsonDocument.Parse(body!).RootElement);

        return Responder(request);
    }

    private static HttpResponseMessage Login(JsonElement body)
    {
        var username = body.GetProperty("username").GetString();
        var password = body.GetProperty("password").GetString();
        var level = (username, password) switch
        {
            ("admin", "Admin@12345") => 100,
            ("user", "User@12345") => 10,
            _ => 0
        };
        if (level == 0)
            return Json(HttpStatusCode.Unauthorized, """{"title":"Unauthorized","status":401,"detail":"Invalid username or password."}""", "application/problem+json");

        var user = new { id = level == 100 ? 1 : 2, username, displayName = level == 100 ? "Form Admin" : "Demo User", level, canCreateForms = level >= 100 };
        return Json(HttpStatusCode.OK, JsonSerializer.Serialize(new { accessToken = $"jwt-{username}", expiresAt = DateTime.UtcNow.AddHours(1), user }));
    }

    public static HttpResponseMessage Json(HttpStatusCode status, string json, string mediaType = "application/json") =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, mediaType) };
}
