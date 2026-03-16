// Footer year
var yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Mobile nav toggle
var navBtn = document.querySelector(".nav-toggle");
var navEl = document.querySelector(".nav");
if (navBtn && navEl) {
  navBtn.addEventListener("click", function () {
    var open = navEl.classList.toggle("is-open");
    navBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// Soft reveal animation
var revealItems = document.querySelectorAll(".reveal");
if (revealItems.length) {
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealItems.forEach(function (el) { io.observe(el); });
}

/* =========================================================================
   Booking Slot Picker
   Used on /book and /admin/phone-booking
   Supports: gender preference, four-hands (2nd therapist), therapist filtering
   ========================================================================= */

(function () {
  var serviceSelect = document.getElementById("service-select");
  var therapistSelect = document.getElementById("therapist-select");
  var therapist2Select = document.getElementById("therapist2-select");
  var therapist2Container = document.getElementById("therapist2-container");
  var genderPrefSelect = document.getElementById("gender-pref-select");
  var dateInput = document.getElementById("date-input");
  var slotsContainer = document.getElementById("slots-container");
  var slotsGrid = document.getElementById("slots-grid");
  var timeInput = document.getElementById("time-input");
  var submitBtn = document.getElementById("submit-btn");

  // Exit if not on a booking page
  if (!serviceSelect || !dateInput) return;

  // Set min date to today
  var today = new Date().toISOString().slice(0, 10);
  dateInput.setAttribute("min", today);

  // Show/hide second therapist based on service category
  function checkFourHands() {
    if (!therapist2Container) return;
    var selected = serviceSelect.options[serviceSelect.selectedIndex];
    var category = selected ? selected.getAttribute("data-category") : "";
    if (category === "four_hands") {
      therapist2Container.style.display = "block";
    } else {
      therapist2Container.style.display = "none";
      if (therapist2Select) therapist2Select.value = "";
    }
  }

  // Filter therapist dropdowns by gender preference
  function filterTherapistsByGender() {
    var genderPref = genderPrefSelect ? genderPrefSelect.value : "";

    [therapistSelect, therapist2Select].forEach(function (sel) {
      if (!sel) return;
      var currentVal = sel.value;
      var options = sel.querySelectorAll("option");
      options.forEach(function (opt) {
        if (!opt.value) return; // skip "No preference" option
        var optGender = opt.getAttribute("data-gender");
        if (genderPref && optGender !== genderPref) {
          opt.style.display = "none";
          opt.disabled = true;
          if (opt.value === currentVal) sel.value = "";
        } else {
          opt.style.display = "";
          opt.disabled = false;
        }
      });
    });
  }

  function fetchSlots() {
    var serviceId = serviceSelect.value;
    var date = dateInput.value;
    var therapistId = therapistSelect ? therapistSelect.value : "";
    var therapist2Id = therapist2Select ? therapist2Select.value : "";
    var genderPref = genderPrefSelect ? genderPrefSelect.value : "";

    if (!serviceId || !date) {
      slotsContainer.style.display = "none";
      slotsGrid.innerHTML = "";
      timeInput.value = "";
      updateSubmitBtn();
      return;
    }

    var url = "/api/availability?service_id=" + serviceId + "&date=" + date;
    if (therapistId) url += "&therapist_id=" + therapistId;
    if (therapist2Id) url += "&therapist2_id=" + therapist2Id;
    if (genderPref) url += "&gender_pref=" + genderPref;

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        slotsGrid.innerHTML = "";
        timeInput.value = "";
        updateSubmitBtn();

        if (!data.slots || data.slots.length === 0) {
          slotsContainer.style.display = "block";
          slotsGrid.innerHTML =
            '<p class="muted small">No available times for this date. Try another date, therapist, or gender preference.</p>';
          return;
        }

        slotsContainer.style.display = "block";

        data.slots.forEach(function (slot) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "slot-btn";
          b.textContent = slot.label;
          b.dataset.time = slot.time;

          b.addEventListener("click", function () {
            slotsGrid
              .querySelectorAll(".slot-btn")
              .forEach(function (s) { s.classList.remove("selected"); });
            b.classList.add("selected");
            timeInput.value = slot.time;
            updateSubmitBtn();
          });

          slotsGrid.appendChild(b);
        });
      })
      .catch(function () {
        slotsContainer.style.display = "block";
        slotsGrid.innerHTML =
          '<p class="muted small">Error loading times. Please try again.</p>';
      });
  }

  function updateSubmitBtn() {
    if (!submitBtn) return;
    if (timeInput.value) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirm Booking";
    } else {
      submitBtn.disabled = true;
      submitBtn.textContent = "Select a time to continue";
    }
  }

  // Event listeners
  serviceSelect.addEventListener("change", function () {
    checkFourHands();
    fetchSlots();
  });
  dateInput.addEventListener("change", fetchSlots);
  if (therapistSelect) therapistSelect.addEventListener("change", fetchSlots);
  if (therapist2Select) therapist2Select.addEventListener("change", fetchSlots);
  if (genderPrefSelect) {
    genderPrefSelect.addEventListener("change", function () {
      filterTherapistsByGender();
      fetchSlots();
    });
  }

  // Initialize
  checkFourHands();
  filterTherapistsByGender();

  if (serviceSelect.value && dateInput.value) {
    fetchSlots();
  }
})();
