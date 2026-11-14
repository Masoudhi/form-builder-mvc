using System.Text.Json;
using FormBuilder.Mvc.Api;
using FormBuilder.Mvc.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormBuilder.Mvc.Controllers.Ajax;

/// <summary>jQuery endpoints for saved forms and submissions. All data comes from form-builder-api.</summary>
[Route("ajax/forms")]
public sealed class FormsDataController(ApiClient api) : ApiProxyController(api)
{
    [HttpGet("")]
    public Task<IActionResult> List() => ForwardAsync(HttpMethod.Get, "api/forms");

    [HttpGet("{id:int}")]
    public Task<IActionResult> Get(int id) => ForwardAsync(HttpMethod.Get, $"api/forms/{id}");

    [HttpPost("{id:int}/delete")]
    [Authorize(Policy = AppAuth.FormCreatorPolicy)]
    public Task<IActionResult> Delete(int id) => ForwardAsync(HttpMethod.Delete, $"api/forms/{id}");

    [HttpPost("{id:int}/submit")]
    public Task<IActionResult> Submit(int id, [FromBody] JsonElement body) =>
        ForwardAsync(HttpMethod.Post, $"api/forms/{id}/submissions", body);

    [HttpGet("{id:int}/submissions")]
    [Authorize(Policy = AppAuth.FormCreatorPolicy)]
    public Task<IActionResult> Submissions(int id) => ForwardAsync(HttpMethod.Get, $"api/forms/{id}/submissions");

    /// <summary>A normal link (not AJAX) so the browser downloads the file.</summary>
    [HttpGet("{id:int}/export")]
    [Authorize(Policy = AppAuth.FormCreatorPolicy)]
    public Task<IActionResult> Export(int id) => ForwardAsync(HttpMethod.Get, $"api/forms/{id}/submissions/export");
}
