using System.Net;
using System.Text;
using FormBuilder.Mvc.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;

namespace FormBuilder.Mvc.Controllers.Ajax;

/// <summary>
/// Base for the endpoints that jQuery calls. Each one forwards to form-builder-api with the user's token
/// and returns the API's status code and JSON unchanged, so validation messages reach the page as-is.
/// </summary>
[ApiExplorerSettings(IgnoreApi = true)]
public abstract class ApiProxyController(ApiClient api) : Controller
{
    protected async Task<IActionResult> ForwardAsync(HttpMethod method, string path, object? body = null)
    {
        var response = await api.SendAsync(method, path, body, HttpContext.RequestAborted);

        // The JWT expired or was rejected: end the MVC session too; the page then goes to the login screen
        if (response.StatusCode == HttpStatusCode.Unauthorized)
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

        if (response.StatusCode == HttpStatusCode.NoContent)
            return NoContent();

        if (response.IsSuccess && response.FileName is not null)
            return File(response.Body, response.ContentType ?? "application/octet-stream", response.FileName);

        return new ContentResult
        {
            StatusCode = (int)response.StatusCode,
            ContentType = response.ContentType ?? "application/json",
            Content = Encoding.UTF8.GetString(response.Body)
        };
    }
}
