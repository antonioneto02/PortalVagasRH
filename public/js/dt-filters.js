function dtBuildFilters(api, filterDivId, cols) {
  var $filterDiv = $('#' + filterDivId).css({
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.4rem'
  });
  $filterDiv.find('label').css({ marginBottom: 0, marginRight: '.25rem', whiteSpace: 'nowrap' });

  cols.forEach(function(c) {
    var col = api.column(c.idx);

    var vals = [];
    col.data().each(function(d) {
      var t = $('<div>').html(String(d || '')).text().trim();
      if (t && t !== '-' && vals.indexOf(t) === -1) vals.push(t);
    });
    vals.sort();

    var $wrap = $('<div>').css({ position: 'relative', display: 'inline-block' });
    var $input = $('<input type="search" class="form-control form-control-sm" autocomplete="off">')
      .attr('placeholder', c.label)
      .css({ width: c.w, minWidth: c.w, fontSize: '.8rem', height: 'calc(1.5em + .5rem + 2px)' });
    $wrap.append($input);

    var $dropdown = $('<div class="dropdown-menu searchable-column">').css({
      position: 'absolute', zIndex: 3000, display: 'none', minWidth: c.w, boxSizing: 'border-box'
    });
    $wrap.append($dropdown);
    $filterDiv.append($wrap);

    $dropdown.append($('<div class="dropdown-item text-muted">').text('Todos').data('value', ''));
    vals.forEach(function(v) {
      $dropdown.append($('<div class="dropdown-item">').text(v).data('value', v));
    });

    function reposition() {
      $dropdown.css({ width: $input.outerWidth() + 'px', top: $input.outerHeight() + 'px', left: 0 });
    }

    $input.on('focus click', function() { reposition(); $dropdown.show(); });
    $input.on('blur', function() { setTimeout(function() { $dropdown.hide(); }, 200); });
    $input.on('input', function() {
      var term = $(this).val().toLowerCase();
      $dropdown.find('.dropdown-item').each(function() {
        var isAll = !$(this).data('value');
        $(this).toggle(isAll || $(this).text().toLowerCase().indexOf(term) !== -1);
      });
      reposition();
      $dropdown.show();
    });

    $dropdown.on('click touchstart', '.dropdown-item', function() {
      var v = $(this).data('value');
      $input.val(v ? $(this).text() : '');
      $dropdown.hide();
      col.search(v ? '^' + $.fn.dataTable.util.escapeRegex(v) + '$' : '', true, false).draw();
    });
  });
}
