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
  var prefsDetails = document.getElementById("prefs-details");
  var dateInput = document.getElementById("date-input");
  var slotsContainer = document.getElementById("slots-container");
  var slotsGrid = document.getElementById("slots-grid");
  var timeInput = document.getElementById("time-input");
  var submitBtn = document.getElementById("submit-btn");

  // Exit if not on a booking page
  if (!serviceSelect || !dateInput) return;

  // Set min date to today. Build it from LOCAL parts — toISOString() is UTC,
  // which in Colorado becomes tomorrow after ~5-6pm and would block same-day
  // booking for the busiest hours of the evening.
  var _n = new Date();
  var today = _n.getFullYear() + "-" + String(_n.getMonth() + 1).padStart(2, "0") +
              "-" + String(_n.getDate()).padStart(2, "0");
  dateInput.setAttribute("min", today);

  // Show/hide second therapist based on service category.
  // On the public form the therapist pickers live inside a collapsed <details>,
  // so a hidden-away second-therapist select would never be seen — open it.
  function checkFourHands() {
    if (!therapist2Container) return;
    var selected = serviceSelect.options[serviceSelect.selectedIndex];
    var category = selected ? selected.getAttribute("data-category") : "";
    if (category === "four_hands") {
      therapist2Container.style.display = "block";
      if (prefsDetails) prefsDetails.open = true;
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

  /**
   * Render a plain message where the time buttons would go.
   * textContent, never innerHTML — nothing here is ever trusted markup.
   */
  function showSlotsMessage(message) {
    slotsContainer.style.display = "block";
    slotsGrid.innerHTML = "";
    var p = document.createElement("p");
    p.className = "muted small slots-hint";
    p.textContent = message;
    slotsGrid.appendChild(p);
    timeInput.value = "";
    updateSubmitBtn();
  }

  function fetchSlots() {
    var serviceId = serviceSelect.value;
    var date = dateInput.value;
    var therapistId = therapistSelect ? therapistSelect.value : "";
    var therapist2Id = therapist2Select ? therapist2Select.value : "";
    var genderPref = genderPrefSelect ? genderPrefSelect.value : "";

    // Picking a date before a service used to return here silently: the client
    // chose a day, nothing appeared, and there was no way to tell why.
    if (!serviceId) {
      showSlotsMessage("Choose a service first.");
      return;
    }
    if (!date) {
      showSlotsMessage("Now pick a date.");
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
          showSlotsMessage(
            "No times left on this date. Try another date, or remove your therapist preference."
          );
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
        showSlotsMessage("Could not load times. Please try again.");
      });
  }

  // The button says different things on different pages (booking vs. reschedule),
  // so each page can supply its own wording via data attributes.
  var readyLabel = (submitBtn && submitBtn.getAttribute("data-ready-label")) || "Confirm Booking";
  var waitingLabel = (submitBtn && submitBtn.getAttribute("data-waiting-label")) || "Select a time to continue";

  function updateSubmitBtn() {
    if (!submitBtn) return;
    if (timeInput.value) {
      submitBtn.disabled = false;
      submitBtn.textContent = readyLabel;
    } else {
      submitBtn.disabled = true;
      submitBtn.textContent = waitingLabel;
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

  // Initialize. Always run fetchSlots: with nothing chosen yet it renders the
  // "Choose a service first" hint, so the time step is never a blank void.
  checkFourHands();
  filterTherapistsByGender();
  fetchSlots();
})();
