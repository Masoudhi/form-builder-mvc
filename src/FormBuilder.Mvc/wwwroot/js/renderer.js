/* Renders a form design as HTML inputs and reads/validates the answers (window.fb.renderer) */
window.fb.renderer = (function ($, fb) {
    'use strict';

    var esc = fb.esc;
    var textual = { Text: true, TextArea: true, Email: true };

    function inputId(prefix, field) { return prefix + '-' + field.key; }

    function control(field, prefix) {
        var id = inputId(prefix, field);
        var common = 'id="' + esc(id) + '" name="' + esc(field.key) + '" class="form-control" ' +
            (field.placeholder ? 'placeholder="' + esc(field.placeholder) + '" ' : '');

        switch (field.type) {
            case 'TextArea':
                return '<textarea ' + common + 'rows="4"></textarea>';
            case 'Select':
                return '<select id="' + esc(id) + '" name="' + esc(field.key) + '" class="form-select">' +
                    '<option value="">Choose…</option>' +
                    $.map(field.options || [], function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') +
                    '</select>';
            case 'Radio':
                return '<div class="radios" role="radiogroup" aria-labelledby="' + esc(id) + '-label">' +
                    $.map(field.options || [], function (o, i) {
                        var rid = id + '-' + i;
                        return '<div class="form-check form-check-inline">' +
                            '<input class="form-check-input" type="radio" name="' + esc(field.key) + '" id="' + esc(rid) + '" value="' + esc(o) + '">' +
                            '<label class="form-check-label" for="' + esc(rid) + '">' + esc(o) + '</label></div>';
                    }).join('') + '</div>';
            case 'Number':
                return '<input type="number" step="any" ' + common +
                    (field.min !== null && field.min !== undefined ? 'min="' + esc(field.min) + '" ' : '') +
                    (field.max !== null && field.max !== undefined ? 'max="' + esc(field.max) + '" ' : '') + '/>';
            case 'Email':
                return '<input type="email" ' + common + '/>';
            case 'Date':
                return '<input type="date" ' + common + '/>';
            default:
                return '<input type="text" ' + common + '/>';
        }
    }

    /** Builds the inputs for all fields inside $container. */
    function render($container, fields, prefix) {
        prefix = prefix || 'f';
        var html = $.map(fields, function (field) {
            var req = field.required ? '<span class="req" aria-hidden="true">*</span>' : '';
            var help = field.helpText ? '<div class="form-text">' + esc(field.helpText) + '</div>' : '';
            var feedback = '<div class="invalid-feedback d-block" data-error-for="' + esc(field.key) + '"></div>';

            if (field.type === 'Checkbox') {
                return '<div class="field" data-key="' + esc(field.key) + '"><div class="form-check">' +
                    '<input class="form-check-input" type="checkbox" id="' + esc(inputId(prefix, field)) + '" name="' + esc(field.key) + '">' +
                    '<label class="form-check-label" for="' + esc(inputId(prefix, field)) + '">' + esc(field.label) + ' ' + req + '</label>' +
                    '</div>' + help + feedback + '</div>';
            }
            return '<div class="field" data-key="' + esc(field.key) + '">' +
                '<label class="form-label fw-semibold" id="' + esc(inputId(prefix, field)) + '-label" for="' + esc(inputId(prefix, field)) + '">' +
                esc(field.label) + ' ' + req + '</label>' + control(field, prefix) + help + feedback + '</div>';
        }).join('');
        $container.html(html);
    }

    /** Reads the answers as the strings the API expects. */
    function read($container, fields) {
        var answers = {};
        $.each(fields, function (_, field) {
            var $inputs = $container.find('[name="' + field.key + '"]');
            var value;
            if (field.type === 'Checkbox') value = $inputs.is(':checked') ? 'true' : 'false';
            else if (field.type === 'Radio') value = $inputs.filter(':checked').val();
            else value = $inputs.val();
            value = value === undefined || value === null ? '' : String(value).trim();
            answers[field.key] = value === '' ? null : value;
        });
        return answers;
    }

    /** Same rules as the API's SubmissionValidator, for instant feedback. The API still checks everything. */
    function validate(fields, answers) {
        var errors = {};
        $.each(fields, function (_, f) {
            var v = answers[f.key];
            var add = function (m) { errors[f.key] = [m]; };
            if (f.type === 'Checkbox') {
                if (f.required && v !== 'true') add(f.label + ' must be checked.');
                return;
            }
            if (v === null) {
                if (f.required) add(f.label + ' is required.');
                return;
            }
            if (textual[f.type]) {
                if (f.min !== null && f.min !== undefined && v.length < f.min) add(f.label + ' must be at least ' + f.min + ' characters.');
                if (f.max !== null && f.max !== undefined && v.length > f.max) add(f.label + ' must be ' + f.max + ' characters or fewer.');
            }
            if (f.type === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) add(f.label + ' must be a valid email address.');
            if (f.type === 'Number') {
                var n = Number(v);
                if (v === '' || isNaN(n)) add(f.label + ' must be a number.');
                else if (f.min !== null && f.min !== undefined && n < f.min) add(f.label + ' must be at least ' + f.min + '.');
                else if (f.max !== null && f.max !== undefined && n > f.max) add(f.label + ' must be at most ' + f.max + '.');
            }
        });
        return errors;
    }

    /** Shows messages under the matching fields; returns messages that matched no field. */
    function showErrors($container, errors) {
        clearErrors($container);
        var unmatched = [];
        $.each(errors || {}, function (key, messages) {
            var $field = $container.find('.field[data-key="' + key + '"]');
            if ($field.length) {
                $field.addClass('has-error').find('[data-error-for]').text(messages[0]);
                $field.find('.form-control, .form-select').addClass('is-invalid');
            } else {
                unmatched.push.apply(unmatched, messages);
            }
        });
        var $first = $container.find('.has-error').first();
        if ($first.length) $first.find('input, select, textarea').first().trigger('focus');
        return unmatched;
    }

    function clearErrors($container) {
        $container.find('.has-error').removeClass('has-error');
        $container.find('.is-invalid').removeClass('is-invalid');
        $container.find('[data-error-for]').text('');
    }

    return { render: render, read: read, validate: validate, showErrors: showErrors, clearErrors: clearErrors };
})(jQuery, window.fb);
