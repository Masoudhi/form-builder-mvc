/* My forms page */
(function ($, fb) {
    'use strict';

    var $grid = $('#forms');

    function card(form) {
        var esc = fb.esc;
        var links = fb.canCreate
            ? '<a class="btn btn-sm btn-outline-secondary" href="/Forms/Builder/' + form.id + '">Edit</a>' +
              (form.isPublished ? '<a class="btn btn-sm btn-outline-secondary" href="/Forms/Fill/' + form.id + '">Fill in</a>' : '') +
              '<a class="btn btn-sm btn-outline-secondary" href="/Forms/Submissions/' + form.id + '">Submissions</a>' +
              '<button type="button" class="btn btn-sm btn-outline-danger js-delete" data-id="' + form.id + '" data-name="' + esc(form.name) + '" data-count="' + form.submissionCount + '">Delete</button>'
            : '<a class="btn btn-sm btn-primary" href="/Forms/Fill/' + form.id + '">Fill in</a>';

        return '<article class="card form-card">' +
            '<div class="card-top"><h2>' + esc(form.name) + '</h2>' +
            '<span class="badge ' + (form.isPublished ? 'badge-published' : 'badge-draft') + '">' + (form.isPublished ? 'Published' : 'Draft') + '</span></div>' +
            '<p class="description">' + (form.description ? esc(form.description) : '<span class="text-muted">No description</span>') + '</p>' +
            '<dl class="stats"><div><dt>Fields</dt><dd>' + form.fieldCount + '</dd></div>' +
            (fb.canCreate ? '<div><dt>Submissions</dt><dd>' + form.submissionCount + '</dd></div>' : '') +
            '<div><dt>Updated</dt><dd>' + fb.formatDate(form.updatedAt) + '</dd></div></dl>' +
            '<div class="actions">' + links + '</div></article>';
    }

    function empty() {
        return fb.canCreate
            ? '<div class="card empty-state"><h2 class="h5">No forms yet</h2><p class="text-muted">Create your first form with the drag-and-drop builder.</p><a class="btn btn-primary" href="/Forms/Builder">Create a form</a></div>'
            : '<div class="card empty-state"><h2 class="h5">No forms to fill in</h2><p class="text-muted">Published forms will appear here.</p></div>';
    }

    function load() {
        fb.api('GET', '/ajax/forms')
            .done(function (forms) {
                $grid.attr('aria-busy', 'false').html(forms.length ? $.map(forms, card).join('') : empty());
            })
            .fail(function (xhr) {
                $grid.attr('aria-busy', 'false').html('<div class="alert alert-danger">' + fb.esc(fb.problem(xhr).message) +
                    ' <button type="button" class="btn btn-link p-0 js-retry">Try again</button></div>');
            });
    }

    $grid.on('click', '.js-retry', load);

    $grid.on('click', '.js-delete', function () {
        var $btn = $(this);
        var count = Number($btn.data('count'));
        var extra = count ? ' and its ' + count + ' submission(s)' : '';
        if (!confirm('Delete "' + $btn.data('name') + '"' + extra + '? This cannot be undone.')) return;

        $btn.prop('disabled', true);
        fb.api('POST', '/ajax/forms/' + $btn.data('id') + '/delete')
            .done(function () {
                $btn.closest('.form-card').fadeOut(200, function () { $(this).remove(); if (!$grid.children().length) $grid.html(empty()); });
                fb.toast('success', '"' + $btn.data('name') + '" deleted.');
            })
            .fail(function (xhr) { $btn.prop('disabled', false); fb.toast('error', fb.problem(xhr).message); });
    });

    load();
})(jQuery, window.fb);
