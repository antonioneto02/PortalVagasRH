(function () {
  'use strict';
  $(document).ready(function () {
    if (!document.querySelector('.sidebar')) return;

    var $hamburger = $(
      '<button class="sidebar-hamburger" id="sidebarHamburger" ' +
      'aria-label="Abrir menu" aria-expanded="false">' +
      '<i class="bi bi-list"></i></button>'
    );
    var $overlay = $('<div class="sidebar-overlay" id="sidebarOverlay"></div>');
    $('body').append($hamburger).append($overlay);

    function openSidebar() {
      $('body').addClass('sidebar-open').css('overflow', 'hidden');
      $hamburger.attr('aria-expanded', 'true');
    }
    function closeSidebar() {
      $('body').removeClass('sidebar-open').css('overflow', '');
      $hamburger.attr('aria-expanded', 'false');
    }

    $hamburger.on('click', function (e) {
      e.stopPropagation();
      $('body').hasClass('sidebar-open') ? closeSidebar() : openSidebar();
    });
    $overlay.on('click', closeSidebar);
    $('.sidebar').on('click', '.nav-item', function () { setTimeout(closeSidebar, 80); });
    $(document).on('keydown', function (e) {
      if (e.key === 'Escape' && $('body').hasClass('sidebar-open')) {
        closeSidebar();
        $hamburger.focus();
      }
    });
    var resizeTimer;
    $(window).on('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if ($(window).width() > 767) closeSidebar();
      }, 100);
    });
  });
})();
