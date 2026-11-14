using System.Net;
using System.Net.Http.Headers;
using System.Text;

namespace FormBuilder.Mvc.Tests;

public sealed class MvcTests : IDisposable
{
    private readonly MvcFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private static HttpRequestMessage Ajax(HttpMethod method, string url, string? token, string? json = null)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Add("X-Requested-With", "XMLHttpRequest");
        if (token is not null) request.Headers.Add("RequestVerificationToken", token);
        if (json is not null) request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        return request;
    }

    // ---- sign-in ----

    [Fact]
    public async Task Pages_require_sign_in()
    {
        var response = await _factory.Browser().GetAsync("/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.StartsWith("/Account/Login", response.Headers.Location!.PathAndQuery);
    }

    [Fact]
    public async Task Ajax_calls_without_a_session_get_401_not_a_redirect()
    {
        var response = await _factory.Browser().SendAsync(Ajax(HttpMethod.Get, "/ajax/forms", null));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(_factory.Api.Requests);
    }

    [Fact]
    public async Task Login_page_is_public_and_lists_the_demo_accounts()
    {
        var html = await _factory.Browser().GetStringAsync("/Account/Login");

        Assert.Contains("Sign in to Form Builder", html);
        Assert.Contains("Admin@12345", html);
    }

    [Fact]
    public async Task Valid_login_signs_in_and_shows_the_user()
    {
        var client = _factory.Browser();

        var response = await MvcFactory.PostLoginAsync(client, "admin", "Admin@12345");
        var home = await client.GetStringAsync("/Forms");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/", response.Headers.Location!.OriginalString);   // Forms/Index is the home page
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), c => c.StartsWith("fb.auth=") && c.Contains("httponly", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("Form Admin", home);
        Assert.Contains("+ New form", home);
    }

    [Fact]
    public async Task Wrong_password_shows_an_error_and_no_cookie()
    {
        var response = await MvcFactory.PostLoginAsync(_factory.Browser(), "admin", "wrong");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("Invalid username or password.", html);
        Assert.False(response.Headers.TryGetValues("Set-Cookie", out var cookies) && cookies.Any(c => c.StartsWith("fb.auth=")));
    }

    [Fact]
    public async Task Api_down_shows_a_clear_message()
    {
        var client = _factory.Browser();
        var page = await client.GetStringAsync("/Account/Login");   // load the form while the API is "up"
        _factory.Api.Down = true;

        var response = await MvcFactory.PostLoginAsync(client, "admin", "Admin@12345");

        Assert.Contains("API is not reachable", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Login_without_the_antiforgery_token_is_rejected()
    {
        var response = await _factory.Browser().PostAsync("/Account/Login",
            new FormUrlEncodedContent(new Dictionary<string, string> { ["Username"] = "admin", ["Password"] = "Admin@12345" }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(_factory.Api.Requests);
    }

    [Fact]
    public async Task Return_url_cannot_send_the_user_to_another_site()
    {
        var response = await MvcFactory.PostLoginAsync(_factory.Browser(), "admin", "Admin@12345", returnUrl: "https://evil.example.com/");

        Assert.Equal("/", response.Headers.Location!.OriginalString);   // Forms/Index is the home page
    }

    [Fact]
    public async Task Sign_out_ends_the_session()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        var token = await MvcFactory.AjaxTokenAsync(client);

        var logout = new HttpRequestMessage(HttpMethod.Post, "/Account/Logout")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["__RequestVerificationToken"] = token })
        };
        await client.SendAsync(logout);

        Assert.Equal(HttpStatusCode.Redirect, (await client.GetAsync("/Forms")).StatusCode);
    }

    // ---- level 100 ----

    [Fact]
    public async Task Level_10_users_cannot_open_the_builder_or_submissions()
    {
        var client = await _factory.SignedInAsync("user", "User@12345");

        var builder = await client.GetAsync("/Forms/Builder");
        var submissions = await client.GetAsync("/Forms/Submissions/1");

        Assert.Equal(HttpStatusCode.Redirect, builder.StatusCode);
        Assert.StartsWith("/Account/AccessDenied", builder.Headers.Location!.PathAndQuery);
        Assert.StartsWith("/Account/AccessDenied", submissions.Headers.Location!.PathAndQuery);
        Assert.DoesNotContain("+ New form", await client.GetStringAsync("/Forms"));
    }

    [Fact]
    public async Task Level_10_ajax_builder_calls_get_403_and_never_reach_the_api()
    {
        var client = await _factory.SignedInAsync("user", "User@12345");
        var token = await MvcFactory.AjaxTokenAsync(client);
        var before = _factory.Api.Requests.Count;

        var start = await client.SendAsync(Ajax(HttpMethod.Post, "/ajax/drafts/start", token, "{}"));
        var delete = await client.SendAsync(Ajax(HttpMethod.Post, "/ajax/forms/1/delete", token));

        Assert.Equal(HttpStatusCode.Forbidden, start.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
        Assert.Equal(before, _factory.Api.Requests.Count);
    }

    // ---- AJAX → API forwarding ----

    [Fact]
    public async Task Ajax_calls_are_forwarded_to_the_api_with_the_users_jwt()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        var token = await MvcFactory.AjaxTokenAsync(client);
        _factory.Api.Responder = _ => StubApi.Json(HttpStatusCode.Created, """{"draftId":"d1","fields":[]}""");

        var response = await client.SendAsync(Ajax(HttpMethod.Post, "/ajax/drafts/start", token, """{"formId":7}"""));

        var call = _factory.Api.Requests.Last();
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("""{"draftId":"d1","fields":[]}""", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpMethod.Post, call.Method);
        Assert.Equal("/api/drafts", call.Path);
        Assert.Equal("Bearer jwt-admin", call.Authorization);
        Assert.Equal("""{"formId":7}""", call.Body);
    }

    [Theory]
    [InlineData("/ajax/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/details", "PUT", "/api/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/details")]
    [InlineData("/ajax/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/fields/abc/remove", "DELETE", "/api/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/fields/abc")]
    [InlineData("/ajax/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/commit", "POST", "/api/drafts/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/commit")]
    [InlineData("/ajax/forms/5/delete", "DELETE", "/api/forms/5")]
    public async Task Ajax_routes_map_to_the_right_api_calls(string url, string apiMethod, string apiPath)
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        var token = await MvcFactory.AjaxTokenAsync(client);

        await client.SendAsync(Ajax(HttpMethod.Post, url, token, "{}"));

        var call = _factory.Api.Requests.Last();
        Assert.Equal(apiMethod, call.Method.Method);
        Assert.Equal(apiPath, call.Path);
    }

    [Fact]
    public async Task Validation_problems_from_the_api_reach_the_page_unchanged()
    {
        var client = await _factory.SignedInAsync("user", "User@12345");
        var token = await MvcFactory.AjaxTokenAsync(client);
        const string problem = """{"title":"One or more validation errors occurred.","status":400,"errors":{"email":["Email must be a valid email address."]}}""";
        _factory.Api.Responder = _ => StubApi.Json(HttpStatusCode.BadRequest, problem, "application/problem+json");

        var response = await client.SendAsync(Ajax(HttpMethod.Post, "/ajax/forms/1/submit", token, """{"answers":{"email":"x"}}"""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(problem, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Ajax_posts_without_the_antiforgery_header_are_rejected()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        var before = _factory.Api.Requests.Count;

        var response = await client.SendAsync(Ajax(HttpMethod.Post, "/ajax/drafts/start", token: null, "{}"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, _factory.Api.Requests.Count);
    }

    [Fact]
    public async Task An_expired_jwt_ends_the_mvc_session()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        _factory.Api.Responder = _ => new HttpResponseMessage(HttpStatusCode.Unauthorized);

        var response = await client.SendAsync(Ajax(HttpMethod.Get, "/ajax/forms", null));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, (await client.GetAsync("/Forms")).StatusCode);
    }

    [Fact]
    public async Task Csv_export_is_returned_as_a_download()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        _factory.Api.Responder = _ =>
        {
            var reply = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(Encoding.UTF8.GetBytes("Name\r\nAsha\r\n")) };
            reply.Content.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
            reply.Content.Headers.ContentDisposition = new ContentDispositionHeaderValue("attachment") { FileName = "feedback-submissions.csv" };
            return reply;
        };

        var response = await client.GetAsync("/ajax/forms/1/export");

        Assert.Equal("text/csv", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("feedback-submissions.csv", response.Content.Headers.ContentDisposition!.FileName?.Trim('"'));
        Assert.Equal("Name\r\nAsha\r\n", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Api_unreachable_returns_502_problem()
    {
        var client = await _factory.SignedInAsync("admin", "Admin@12345");
        _factory.Api.Down = true;

        var response = await client.SendAsync(Ajax(HttpMethod.Get, "/ajax/forms", null));

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Responses_carry_security_headers()
    {
        var response = await _factory.Browser().GetAsync("/Account/Login");

        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
    }
}
