using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace FormBuilder.Mvc.Api;

public sealed class ApiOptions
{
    public const string Section = "Api";

    /// <summary>Base address of form-builder-api, e.g. http://localhost:5080/</summary>
    public string BaseUrl { get; init; } = "http://localhost:5080/";
}

/// <summary>Raw API reply, passed back to the browser unchanged by the AJAX endpoints.</summary>
public sealed record ApiResponse(HttpStatusCode StatusCode, string? ContentType, byte[] Body, string? FileName)
{
    public bool IsSuccess => (int)StatusCode is >= 200 and < 300;

    public static ApiResponse Unreachable() => new(HttpStatusCode.BadGateway, "application/problem+json",
        JsonSerializer.SerializeToUtf8Bytes(new { title = "The Form Builder API cannot be reached.", status = 502 }), null);
}

public sealed record ApiUser(int Id, string Username, string DisplayName, int Level, bool CanCreateForms);

public sealed record LoginResult(string AccessToken, DateTime ExpiresAt, ApiUser User);

public enum LoginOutcome
{
    Success,
    InvalidCredentials,
    TooManyAttempts,
    ApiUnavailable
}

/// <summary>
/// The only way the MVC app reaches data: HTTP calls to form-builder-api.
/// The signed-in user's JWT is attached by <see cref="BearerTokenHandler"/>.
/// </summary>
public sealed class ApiClient(HttpClient http, ILogger<ApiClient> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<(LoginOutcome Outcome, LoginResult? Result)> LoginAsync(string username, string password, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await http.PostAsJsonAsync("api/auth/login", new { username, password }, Json, cancellationToken);
            return response.StatusCode switch
            {
                HttpStatusCode.OK => (LoginOutcome.Success, await response.Content.ReadFromJsonAsync<LoginResult>(Json, cancellationToken)),
                HttpStatusCode.TooManyRequests => (LoginOutcome.TooManyAttempts, null),
                HttpStatusCode.Unauthorized or HttpStatusCode.BadRequest => (LoginOutcome.InvalidCredentials, null),
                _ => (LoginOutcome.ApiUnavailable, null)
            };
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Login call to the API failed");
            return (LoginOutcome.ApiUnavailable, null);
        }
    }

    /// <summary>Sends a request and returns the reply as-is (status, content type, body).</summary>
    public async Task<ApiResponse> SendAsync(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
            request.Content = JsonContent.Create(body, options: Json);

        try
        {
            using var response = await http.SendAsync(request, cancellationToken);
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return new ApiResponse(
                response.StatusCode,
                response.Content.Headers.ContentType?.ToString(),
                bytes,
                FileName(response.Content.Headers.ContentDisposition));
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "API call {Method} {Path} failed", method, path);
            return ApiResponse.Unreachable();
        }
    }

    private static string? FileName(ContentDispositionHeaderValue? disposition) =>
        (disposition?.FileNameStar ?? disposition?.FileName)?.Trim('"');
}
