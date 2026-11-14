/* Submissions table for one form (level 100) */
(function ($, fb) {
    'use strict';

    var $root = $('#submissions');
    var formId = $root.data('form-id');
    var esc = fb.esc;

    function cell(field, value) {
        if (value === null || value === undefined || value === '') return '<span class="text-muted">—</span>';
        if (field.type === 'Checkbox') return value === 'true' ? 'Yes' : 'No';
        return esc(value);
    }

    $.when(fb.api('GET', '/ajax/forms/' + formId), fb.api('GET', '/ajax/forms/' + formId + '/submissions'))
        .done(function (formReply, rowsReply) {
            var form = formReply[0], rows = rowsReply[0];
            document.title = 'Submissions · ' + form.name + ' · Form Builder';
            $('#sub-title').text(form.name);
            $('#sub-count').text(rows.length + (rows.length === 1 ? ' submission' : ' submissions'));
            $('#btn-export').toggleClass('disabled', rows.length === 0).attr('aria-disabled', rows.length === 0);

            if (!rows.length) {
                $('#sub-body').html('<div class="card empty-state"><h2 class="h5">No submissions yet</h2><p class="text-muted mb-0">' +
                    (form.isPublished ? 'Share the <a href="/Forms/Fill/' + form.id + '">form link</a> to start collecting answers.'
                                      : 'Publish the form in the builder to start collecting answers.') + '</p></div>');
                return;
            }

            $('#sub-body').html(
                '<div class="card table-wrap"><table class="table table-hover align-top mb-0"><thead><tr><th scope="col">Submitted</th>' +
                $.map(form.fields, function (f) { return '<th scope="col">' + esc(f.label) + '</th>'; }).join('') +
                '</tr></thead><tbody>' +
                $.map(rows, function (r) {
                    return '<tr><td class="text-nowrap text-muted">' + fb.formatDateTime(r.submittedAt) + '</td>' +
                        $.map(form.fields, function (f) { return '<td>' + cell(f, r.answers[f.key]) + '</td>'; }).join('') + '</tr>';
                }).join('') +
                '</tbody></table></div>');
        })
        .fail(function (xhr) {
            $('#sub-count').text('');
            $('#sub-body').html('<div class="alert alert-danger">' + esc(fb.problem(xhr).message) + '</div>');
        });
})(jQuery, window.fb);
