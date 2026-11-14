/*
 * Form builder page (jQuery + jQuery UI).
 * The form being edited is a draft kept in memory by the API. Every action below is one AJAX call that
 * changes that draft; nothing reaches the database until "Save" commits the draft in a single write.
 */
(function ($, fb) {
    'use strict';

    var TYPES = [
        ['Text', 'Short text', 'Aa'], ['TextArea', 'Long text', '¶'], ['Email', 'Email', '@'], ['Number', 'Number', '#'],
        ['Date', 'Date', '31'], ['Select', 'Dropdown', '▾'], ['Radio', 'Single choice', '◉'], ['Checkbox', 'Checkbox', '✓']
    ];
    var TYPE_INFO = {};
    $.each(TYPES, function (_, t) { TYPE_INFO[t[0]] = { label: t[1], icon: t[2] }; });

    var esc = fb.esc;
    var $root = $('#builder');
    var $canvas = $('#canvas');
    var $props = $('#properties');
    var $name = $('#form-name'), $desc = $('#form-description'), $published = $('#form-published');

    var formId = $root.data('form-id') || null;
    var draft = null;           // last draft returned by the API
    var selectedId = null;      // id of the field shown in the settings panel
    var dirty = false;          // changes not yet committed
    var expired = false;
    var queue = $.Deferred().resolve().promise();   // calls run one after another, in order
    var timers = {};            // debounced edits
    var keyEdited = false;      // the user typed a key by hand
    var justDragged = false;

    // ---------------------------------------------------------------- API calls

    function url(path) { return '/ajax/drafts/' + draft.draftId + path; }

    /** Runs tasks one after another, even when an earlier one failed. */
    function enqueue(task) {
        queue = queue.then(task, task);
    }

    /** Queues one change; the API answers with the whole updated draft. */
    function change(method, path, body, after) {
        if (expired) return;
        enqueue(function () {
            return fb.api(method, url(path), body)
                .done(function (d) { dirty = true; apply(d); if (after) after(d); })
                .fail(failed);
        });
    }

    function failed(xhr) {
        var p = fb.problem(xhr);
        if (p.status === 404) {
            expired = true;
            $('#problems').removeClass('d-none alert-warning').addClass('alert-danger').html(
                'This draft expired after a period of inactivity, so unsaved changes were dropped. ' +
                '<a href="' + location.pathname + '" class="alert-link">Reload the form</a>');
            setEnabled(false);
            return;
        }
        var first = $.map(p.errors, function (m) { return m; })[0];
        fb.toast('error', first || p.message);
    }

    function start() {
        fb.api('POST', '/ajax/drafts/start', { formId: formId })
            .done(function (d) {
                dirty = false;
                selectedId = d.fields.length ? d.fields[0].id : null;
                apply(d, true);
                setEnabled(true);
            })
            .fail(function (xhr) {
                $('#problems').removeClass('d-none alert-warning').addClass('alert-danger').text(fb.problem(xhr).message);
                $('#draft-status').text('');
            });
    }

    // ---------------------------------------------------------------- rendering

    function apply(d, full) {
        var typeChanged = draft && selectedId && field(selectedId, draft) && field(selectedId, d) &&
            field(selectedId, draft).type !== field(selectedId, d).type;
        var selectionGone = selectedId && !field(selectedId, d);
        draft = d;
        if (selectionGone) selectedId = d.fields.length ? d.fields[0].id : null;

        renderDetails(full);
        renderCanvas();
        renderProblems();
        renderStatus();
        if (full || typeChanged || selectionGone || !$props.data('field') || $props.data('field') !== selectedId) renderProperties();
        else refreshPropertyValues();
    }

    function field(id, d) {
        return $.grep((d || draft).fields, function (f) { return f.id === id; })[0];
    }

    function indexOf(id) {
        var i = -1;
        $.each(draft.fields, function (n, f) { if (f.id === id) i = n; });
        return i;
    }

    /** Sets an input's value unless the user is typing in it. */
    function setIdle($el, value) {
        if (!$el.is(':focus')) $el.val(value);
    }

    function renderDetails(full) {
        if (full) {
            $name.val(draft.name);
            $desc.val(draft.description || '');
        }
        $published.prop('checked', draft.isPublished);
        document.title = (draft.name || 'Untitled form') + ' · Form Builder';
    }

    function fieldProblems(index) {
        var prefix = 'fields[' + index + '].';
        var list = [];
        $.each(draft.problems || {}, function (key, messages) { if (key.indexOf(prefix) === 0) list.push.apply(list, messages); });
        return list;
    }

    function renderCanvas() {
        if (!draft.fields.length) {
            $canvas.html('<li class="drop-hint">Drag a field here to start building your form.</li>');
            return;
        }
        $canvas.html($.map(draft.fields, function (f, i) {
            var info = TYPE_INFO[f.type] || TYPE_INFO.Text;
            var invalid = fieldProblems(i).length > 0;
            return '<li class="canvas-field' + (f.id === selectedId ? ' selected' : '') + (invalid ? ' invalid' : '') + '" data-id="' + esc(f.id) + '" tabindex="0">' +
                '<span class="handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span>' +
                '<span class="icon" aria-hidden="true">' + esc(info.icon) + '</span>' +
                '<span class="field-text"><strong>' + esc(f.label || 'Untitled field') + (f.required ? '<span class="req"> *</span>' : '') + '</strong>' +
                '<small class="text-muted">' + esc(info.label) + ' · ' + esc(f.key) + '</small></span>' +
                '<span class="field-actions">' +
                '<button type="button" class="icon-btn js-duplicate" title="Duplicate" aria-label="Duplicate field">⧉</button>' +
                '<button type="button" class="icon-btn danger js-remove" title="Delete" aria-label="Delete field">✕</button>' +
                '</span></li>';
        }).join(''));
    }

    function renderProblems() {
        var messages = [];
        $.each(draft.problems || {}, function (key, list) {
            var m = /^fields\[(\d+)\]/.exec(key);
            var where = m ? '"' + ((draft.fields[+m[1]] || {}).label || 'Field ' + (+m[1] + 1)) + '": ' : '';
            $.each(list, function (_, text) { messages.push(where + text); });
        });
        var $p = $('#problems');
        if (expired) return;
        if (!messages.length) { $p.addClass('d-none').empty(); return; }
        $p.removeClass('d-none alert-danger').addClass('alert-warning').html(
            '<strong>' + messages.length + ' thing' + (messages.length > 1 ? 's' : '') + ' to fix before saving:</strong><ul class="mb-0">' +
            $.map(messages, function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>');
    }

    function renderStatus() {
        $('#draft-status')
            .text(dirty ? 'Unsaved changes' : 'All changes saved')
            .toggleClass('unsaved', dirty);
    }

    function renderProperties() {
        var f = selectedId && field(selectedId);
        keyEdited = false;
        if (!f) {
            $props.data('field', null).html('<h2>Field settings</h2><p class="text-muted">Select a field on the form to edit it.</p>');
            return;
        }
        var limits = f.type === 'Number' ? ['Min value', 'Max value'] : ['Min length', 'Max length'];
        var hasOptions = f.type === 'Select' || f.type === 'Radio';
        var hasLimits = f.type === 'Text' || f.type === 'TextArea' || f.type === 'Email' || f.type === 'Number';
        var hasPlaceholder = hasLimits;

        $props.data('field', f.id).html(
            '<h2>Field settings</h2>' +
            '<div class="field-errors"></div>' +
            '<label class="form-label">Label<input class="form-control" data-prop="label" maxlength="120" value="' + esc(f.label) + '"></label>' +
            '<label class="form-label">Type<select class="form-select" data-prop="type">' +
            $.map(TYPES, function (t) { return '<option value="' + t[0] + '"' + (t[0] === f.type ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') +
            '</select></label>' +
            '<div class="form-check"><input class="form-check-input" type="checkbox" id="prop-required" data-prop="required"' + (f.required ? ' checked' : '') + '>' +
            '<label class="form-check-label fw-semibold" for="prop-required">Required</label></div>' +
            (hasPlaceholder ? '<label class="form-label">Placeholder<input class="form-control" data-prop="placeholder" value="' + esc(f.placeholder || '') + '"></label>' : '') +
            (hasOptions ? '<label class="form-label">Options <small class="text-muted">(one per line)</small><textarea class="form-control" rows="5" data-prop="options">' + esc((f.options || []).join('\n')) + '</textarea></label>' : '') +
            (hasLimits ? '<div class="row g-2"><div class="col"><label class="form-label">' + limits[0] + '<input type="number" class="form-control" data-prop="min" value="' + esc(f.min === null || f.min === undefined ? '' : f.min) + '"></label></div>' +
                '<div class="col"><label class="form-label">' + limits[1] + '<input type="number" class="form-control" data-prop="max" value="' + esc(f.max === null || f.max === undefined ? '' : f.max) + '"></label></div></div>' : '') +
            '<label class="form-label">Help text<input class="form-control" data-prop="helpText" value="' + esc(f.helpText || '') + '"></label>' +
            '<label class="form-label">Key <small class="text-muted">(used in submissions and CSV)</small><input class="form-control font-monospace" data-prop="key" maxlength="50" value="' + esc(f.key) + '"></label>');
        refreshPropertyValues();
    }

    /** After an edit: update what the server changed (e.g. the key) without disturbing the input being typed in. */
    function refreshPropertyValues() {
        var f = selectedId && field(selectedId);
        if (!f) return;
        setIdle($props.find('[data-prop="key"]'), f.key);
        var problems = fieldProblems(indexOf(f.id));
        $props.find('.field-errors').html($.map(problems, function (m) { return '<p class="field-error">' + esc(m) + '</p>'; }).join(''));
    }

    function select(id) {
        if (selectedId === id) return;
        flush();
        selectedId = id;
        $canvas.find('.canvas-field').removeClass('selected').filter('[data-id="' + id + '"]').addClass('selected');
        renderProperties();
    }

    // ---------------------------------------------------------------- edits

    function readFieldForm() {
        var num = function (prop) { var v = $props.find('[data-prop="' + prop + '"]').val(); return v === undefined || v === '' ? null : Number(v); };
        var $options = $props.find('[data-prop="options"]');
        return {
            label: $props.find('[data-prop="label"]').val(),
            type: $props.find('[data-prop="type"]').val(),
            required: $props.find('[data-prop="required"]').is(':checked'),
            key: keyEdited ? $props.find('[data-prop="key"]').val() : null,
            placeholder: $props.find('[data-prop="placeholder"]').val() || null,
            helpText: $props.find('[data-prop="helpText"]').val() || null,
            options: $options.length ? $options.val().split('\n') : [],
            min: num('min'),
            max: num('max')
        };
    }

    /** Runs fn after the user stops typing for a moment (one API call instead of one per key press). */
    function debounce(name, fn, ms) {
        clearTimeout(timers[name] && timers[name].id);
        timers[name] = { fn: fn, id: setTimeout(function () { delete timers[name]; fn(); }, ms || 400) };
    }

    /** Sends any edit still waiting for its debounce. */
    function flush() {
        $.each($.extend({}, timers), function (name, t) { clearTimeout(t.id); delete timers[name]; t.fn(); });
    }

    function sendField() {
        var id = $props.data('field');
        if (!id) return;
        var body = readFieldForm();
        change('POST', '/fields/' + encodeURIComponent(id), body);
        if (body.key) keyEdited = false;
    }

    function sendDetails() {
        change('POST', '/details', { name: $name.val(), description: $desc.val(), isPublished: $published.is(':checked') });
    }

    function addField(type, index) {
        var before = $.map(draft.fields, function (f) { return f.id; });
        change('POST', '/fields', { type: type, index: index === undefined ? null : index }, function (d) {
            var added = $.grep(d.fields, function (f) { return before.indexOf(f.id) < 0; })[0];
            if (added) { selectedId = added.id; renderCanvas(); renderProperties(); }
        });
    }

    function setEnabled(on) {
        $name.add($desc).add($published).add('#btn-save, #btn-preview').prop('disabled', !on);
        $canvas.sortable(on ? 'enable' : 'disable');
        $('#palette .palette-item').draggable(on ? 'enable' : 'disable');
    }

    function save() {
        flush();
        var $btn = $('#btn-save').prop('disabled', true).text('Saving…');
        enqueue(function () {
            return fb.api('POST', url('/commit'))
                .done(function (form) {
                    fb.toast('success', '"' + form.name + '" saved.');
                    formId = form.id;
                    if (location.pathname.toLowerCase().indexOf('/forms/builder/' + form.id) < 0)
                        history.replaceState(null, '', '/Forms/Builder/' + form.id);
                    start();   // keep editing in a fresh draft of the saved form
                })
                .fail(function (xhr) {
                    var p = fb.problem(xhr);
                    if (p.status === 400) { renderProblems(); fb.toast('error', 'Fix the listed problems, then save again.'); }
                    else failed(xhr);
                })
                .always(function () { $btn.prop('disabled', false).text('Save'); });
        });
    }

    // ---------------------------------------------------------------- events

    $name.add($desc).on('input', function () { debounce('details', sendDetails); });
    $published.on('change', sendDetails);

    $props.on('input', '[data-prop]:not([data-prop="type"]):not([data-prop="required"])', function () {
        if ($(this).data('prop') === 'key') keyEdited = true;
        debounce('field', sendField);
    });
    $props.on('change', '[data-prop="type"], [data-prop="required"]', function () { flush(); sendField(); });

    $canvas.on('click', '.canvas-field', function () { select($(this).data('id')); });
    $canvas.on('keydown', '.canvas-field', function (e) { if (e.key === 'Enter') select($(this).data('id')); });
    $canvas.on('click', '.js-duplicate', function (e) {
        e.stopPropagation();
        var id = $(this).closest('.canvas-field').data('id');
        var before = $.map(draft.fields, function (f) { return f.id; });
        change('POST', '/fields/' + encodeURIComponent(id) + '/duplicate', undefined, function (d) {
            var copy = $.grep(d.fields, function (f) { return before.indexOf(f.id) < 0; })[0];
            if (copy) { selectedId = copy.id; renderCanvas(); renderProperties(); }
        });
    });
    $canvas.on('click', '.js-remove', function (e) {
        e.stopPropagation();
        var id = $(this).closest('.canvas-field').data('id');
        if (id === selectedId) flush();
        change('POST', '/fields/' + encodeURIComponent(id) + '/remove');
    });

    // Reorder fields, and accept new ones dragged from the palette
    $canvas.sortable({
        items: '> li.canvas-field',
        handle: '.handle',
        placeholder: 'canvas-placeholder',
        tolerance: 'pointer',
        disabled: true,
        update: function (_e, ui) {
            var index = ui.item.prevAll('.canvas-field').length;
            if (ui.item.hasClass('palette-item')) {
                var type = ui.item.data('type');
                ui.item.remove();
                addField(type, index);
            } else {
                change('POST', '/fields/' + encodeURIComponent(ui.item.data('id')) + '/move', { toIndex: index });
            }
        }
    });

    $('#palette .palette-item').draggable({
        connectToSortable: '#canvas',
        helper: 'clone',
        revert: 'invalid',
        appendTo: 'body',
        zIndex: 1000,
        disabled: true,
        start: function () { justDragged = true; },
        stop: function () { setTimeout(function () { justDragged = false; }, 50); }
    }).on('click', function () {
        if (!justDragged && draft && !expired) addField($(this).data('type'));
    });

    $('#btn-save').on('click', save);

    $('#btn-cancel').on('click', function () {
        if (dirty && !confirm('Discard your unsaved changes?')) return;
        flush();
        var leave = function () { dirty = false; location.href = '/Forms'; };
        if (draft && !expired) fb.api('POST', url('/discard')).always(leave); else leave();
    });

    $('#btn-preview').on('click', function () {
        var showing = !$('#preview').hasClass('d-none');
        if (showing) {
            $('#preview').addClass('d-none');
            $('.workspace').removeClass('d-none');
            $(this).text('Preview');
            return;
        }
        flush();
        var $p = $('#preview').removeClass('d-none').html(
            '<h2>' + esc(draft.name || 'Untitled form') + '</h2>' +
            (draft.description ? '<p class="text-muted">' + esc(draft.description) + '</p>' : '') +
            '<div class="preview-fields"></div><button type="button" class="btn btn-primary mt-3" disabled title="Preview only">Submit</button>');
        fb.renderer.render($p.find('.preview-fields'), draft.fields, 'preview');
        $('.workspace').addClass('d-none');
        $(this).text('Back to editor');
    });

    $(window).on('beforeunload', function (e) {
        if (dirty && !expired) { e.preventDefault(); return ''; }
    });

    start();
})(jQuery, window.fb);
