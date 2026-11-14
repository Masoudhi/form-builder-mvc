using System.Text.Json;
using FormBuilder.Mvc.Api;
using FormBuilder.Mvc.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormBuilder.Mvc.Controllers.Ajax;

/// <summary>
/// jQuery endpoints for the builder. Each call changes the in-memory draft held by the API;
/// only <see cref="Commit"/> makes the API write to MySQL. Level 100 only.
/// </summary>
[Route("ajax/drafts")]
[Authorize(Policy = AppAuth.FormCreatorPolicy)]
public sealed class DraftsController(ApiClient api) : ApiProxyController(api)
{
    [HttpPost("start")]
    public Task<IActionResult> Start([FromBody] JsonElement body) => ForwardAsync(HttpMethod.Post, "api/drafts", body);

    [HttpGet("{draftId:guid}")]
    public Task<IActionResult> Get(Guid draftId) => ForwardAsync(HttpMethod.Get, $"api/drafts/{draftId}");

    [HttpPost("{draftId:guid}/details")]
    public Task<IActionResult> Details(Guid draftId, [FromBody] JsonElement body) =>
        ForwardAsync(HttpMethod.Put, $"api/drafts/{draftId}/details", body);

    [HttpPost("{draftId:guid}/fields")]
    public Task<IActionResult> AddField(Guid draftId, [FromBody] JsonElement body) =>
        ForwardAsync(HttpMethod.Post, $"api/drafts/{draftId}/fields", body);

    [HttpPost("{draftId:guid}/fields/{fieldId}")]
    public Task<IActionResult> UpdateField(Guid draftId, string fieldId, [FromBody] JsonElement body) =>
        ForwardAsync(HttpMethod.Put, $"api/drafts/{draftId}/fields/{Uri.EscapeDataString(fieldId)}", body);

    [HttpPost("{draftId:guid}/fields/{fieldId}/move")]
    public Task<IActionResult> MoveField(Guid draftId, string fieldId, [FromBody] JsonElement body) =>
        ForwardAsync(HttpMethod.Post, $"api/drafts/{draftId}/fields/{Uri.EscapeDataString(fieldId)}/move", body);

    [HttpPost("{draftId:guid}/fields/{fieldId}/duplicate")]
    public Task<IActionResult> DuplicateField(Guid draftId, string fieldId) =>
        ForwardAsync(HttpMethod.Post, $"api/drafts/{draftId}/fields/{Uri.EscapeDataString(fieldId)}/duplicate");

    [HttpPost("{draftId:guid}/fields/{fieldId}/remove")]
    public Task<IActionResult> RemoveField(Guid draftId, string fieldId) =>
        ForwardAsync(HttpMethod.Delete, $"api/drafts/{draftId}/fields/{Uri.EscapeDataString(fieldId)}");

    [HttpPost("{draftId:guid}/commit")]
    public Task<IActionResult> Commit(Guid draftId) => ForwardAsync(HttpMethod.Post, $"api/drafts/{draftId}/commit");

    [HttpPost("{draftId:guid}/discard")]
    public Task<IActionResult> Discard(Guid draftId) => ForwardAsync(HttpMethod.Delete, $"api/drafts/{draftId}");
}
