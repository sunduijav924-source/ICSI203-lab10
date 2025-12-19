// ====== CONFIG ======
const OPENWEATHER_KEY = "67d28af82bde064adbae151f48991ff6";
const GEO_URL = "https://api.openweathermap.org/geo/1.0/direct";
const ONECALL_URL = "https://api.openweathermap.org/data/3.0/onecall";
// If your plan supports history/timemachine, you can add it here:
// const TIMEMACHINE_URL = "https://api.openweathermap.org/data/3.0/onecall/timemachine";

const UNITS = "metric"; // or "imperial"
const SUGGEST_LIMIT = 7;

// ====== DOM ======
const cityInput = document.getElementById("cityInput");
const suggestBox = document.getElementById("suggestBox");
const searchBtn = document.getElementById("searchBtn");
const geoBtn = document.getElementById("geoBtn");

const err = document.getElementById("err");
const updatedBadge = document.getElementById("updatedBadge");

const nowBlock = document.getElementById("nowBlock");
const cardsGrid = document.getElementById("cardsGrid");

const placeName = document.getElementById("placeName");
const weatherDesc = document.getElementById("weatherDesc");
const metaLine = document.getElementById("metaLine");
const tempNow = document.getElementById("tempNow");
const iconNow = document.getElementById("iconNow");
const feelsLike = document.getElementById("feelsLike");
const humidity = document.getElementById("humidity");
const wind = document.getElementById("wind");
const pressure = document.getElementById("pressure");

const dayTableWrap = document.getElementById("dayTableWrap");
const dayRows = document.getElementById("dayRows");

const hourlyTitle = document.getElementById("hourlyTitle");
const hourlyHeading = document.getElementById("hourlyHeading");
const hourlySub = document.getElementById("hourlySub");
const hourlyGrid = document.getElementById("hourlyGrid");
const yesterdayNote = document.getElementById("yesterdayNote");

// ====== UTILS ======
const fmtDay = (unix, tz) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: tz })
    .format(new Date(unix * 1000));

const fmtTime = (unix, tz) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz })
    .format(new Date(unix * 1000));

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function showError(msg){
  err.textContent = msg;
  err.hidden = false;
}
function clearError(){
  err.hidden = true;
  err.textContent = "";
}

// Debounce
function debounce(fn, ms=250){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ====== AUTOCOMPLETE (Geocoding API) ======
let activeIndex = -1;
let lastSuggestions = [];

async function geocodeSuggest(q){
  if(!q || q.trim().length < 2){
    closeSuggest();
    return;
  }

  const url = `${GEO_URL}?q=${encodeURIComponent(q.trim())}&limit=${SUGGEST_LIMIT}&appid=${OPENWEATHER_KEY}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();

  // Light client-side “contains” behavior:
  const needle = q.trim().toLowerCase();
  const filtered = data
    .map(x => ({
      name: x.name,
      state: x.state || "",
      country: x.country || "",
      lat: x.lat,
      lon: x.lon
    }))
    .filter(x => `${x.name} ${x.state} ${x.country}`.toLowerCase().includes(needle));

  lastSuggestions = filtered;
  renderSuggest(filtered);
}

function renderSuggest(items){
  suggestBox.innerHTML = "";
  activeIndex = -1;

  if(!items.length){
    closeSuggest();
    return;
  }

  for(const [i, it] of items.entries()){
    const div = document.createElement("div");
    div.className = "item";
    div.role = "option";
    div.tabIndex = -1;

    const left = document.createElement("div");
    left.innerHTML = `<div class="name">${it.name}</div>
                      <div class="subtxt">${[it.state, it.country].filter(Boolean).join(", ")}</div>`;
    const right = document.createElement("div");
    right.className = "subtxt";
    right.textContent = `${it.lat.toFixed(2)}, ${it.lon.toFixed(2)}`;

    div.append(left, right);

    div.addEventListener("mousedown", (e) => {
      // mousedown so it fires before input blur
      e.preventDefault();
      chooseSuggestion(i);
    });

    suggestBox.appendChild(div);
  }

  suggestBox.classList.add("open");
}

function closeSuggest(){
  suggestBox.classList.remove("open");
  suggestBox.innerHTML = "";
  activeIndex = -1;
}

function setActive(index){
  const items = [...suggestBox.querySelectorAll(".item")];
  items.forEach(el => el.classList.remove("active"));
  if(index >= 0 && index < items.length){
    items[index].classList.add("active");
    activeIndex = index;
  }
}

function chooseSuggestion(i){
  const it = lastSuggestions[i];
  if(!it) return;
  cityInput.value = `${it.name}${it.state ? ", " + it.state : ""}, ${it.country}`;
  closeSuggest();
  loadWeatherByCoords(it.lat, it.lon, it);
}

cityInput.addEventListener("input", debounce(async () => {
  clearError();
  try{
    await geocodeSuggest(cityInput.value);
  } catch(e){
    // Don’t spam error UI while typing; just close suggestions
    closeSuggest();
  }
}, 250));

cityInput.addEventListener("keydown", (e) => {
  if(!suggestBox.classList.contains("open")) return;

  const count = suggestBox.querySelectorAll(".item").length;
  if(e.key === "ArrowDown"){
    e.preventDefault();
    setActive((activeIndex + 1) % count);
  } else if(e.key === "ArrowUp"){
    e.preventDefault();
    setActive((activeIndex - 1 + count) % count);
  } else if(e.key === "Enter"){
    if(activeIndex >= 0){
      e.preventDefault();
      chooseSuggestion(activeIndex);
    }
  } else if(e.key === "Escape"){
    closeSuggest();
  }
});

cityInput.addEventListener("blur", () => setTimeout(closeSuggest, 120));

// ====== WEATHER (One Call) ======
async function loadWeatherByCityText(){
  clearError();
  const q = cityInput.value.trim();
  if(!q) return showError("Type a city name first.");

  // Use geocoding to get (lat,lon) from typed city
  const url = `${GEO_URL}?q=${encodeURIComponent(q)}&limit=1&appid=${OPENWEATHER_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if(!res.ok || !data.length) return showError("City not found.");

  await loadWeatherByCoords(data[0].lat, data[0].lon, data[0]);
}

async function loadWeatherByCoords(lat, lon, placeMeta=null){
  clearError();

  const url = `${ONECALL_URL}?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_KEY}&units=${UNITS}`;
  const res = await fetch(url);
  const data = await res.json();

  if(!res.ok){
    return showError(data?.message || "Weather request failed.");
  }

  renderNow(data, placeMeta);
  render3Day(data);
  // default hourly: today
  selectDay("today", data);
}

function renderNow(data, placeMeta){
  const tz = data.timezone;
  const c = data.current;

  nowBlock.hidden = false;
  cardsGrid.hidden = false;

  const prettyName = placeMeta
    ? `${placeMeta.name}${placeMeta.state ? ", " + placeMeta.state : ""}, ${placeMeta.country || ""}`.trim()
    : "Selected location";

  placeName.textContent = prettyName;
  weatherDesc.textContent = cap(c.weather?.[0]?.description || "—");

  const upd = new Date(c.dt * 1000);
  updatedBadge.textContent = `Updated: ${new Intl.DateTimeFormat(undefined, { hour:"2-digit", minute:"2-digit" }).format(upd)}`;

  metaLine.textContent = `${fmtDay(c.dt, tz)} • ${fmtTime(c.dt, tz)} • Lat ${data.lat.toFixed(2)}, Lon ${data.lon.toFixed(2)}`;

  tempNow.textContent = `${Math.round(c.temp)}°`;
  iconNow.src = `https://openweathermap.org/img/wn/${c.weather?.[0]?.icon || "01d"}@2x.png`;

  feelsLike.textContent = `${Math.round(c.feels_like)}°`;
  humidity.textContent = `${c.humidity}%`;
  wind.textContent = `${c.wind_speed} ${UNITS === "metric" ? "m/s" : "mph"}`;
  pressure.textContent = `${c.pressure} hPa`;
}

function render3Day(data){
  dayTableWrap.hidden = false;
  dayRows.innerHTML = "";

  // Today + Tomorrow from daily. (daily[0] = today, daily[1] = tomorrow)
  const today = data.daily?.[0];
  const tomorrow = data.daily?.[1];

  // “Yesterday” (free-friendly): last 24 hours from hourly (approx calendar yesterday)
  // We’ll compute min/max from hourly[0..23].
  const last24 = data.hourly?.slice(0, 24) || [];
  const yMin = last24.length ? Math.min(...last24.map(h => h.temp)) : null;
  const yMax = last24.length ? Math.max(...last24.map(h => h.temp)) : null;

  const rows = [
    {
      key:"yesterday",
      label:"Yesterday (last 24h)",
      min: yMin,
      max: yMax,
      icon: last24[0]?.weather?.[0]?.icon,
      desc: last24[0]?.weather?.[0]?.description
    },
    {
      key:"today",
      label:"Today",
      min: today?.temp?.min,
      max: today?.temp?.max,
      icon: today?.weather?.[0]?.icon,
      desc: today?.weather?.[0]?.description
    },
    {
      key:"tomorrow",
      label:"Tomorrow",
      min: tomorrow?.temp?.min,
      max: tomorrow?.temp?.max,
      icon: tomorrow?.weather?.[0]?.icon,
      desc: tomorrow?.weather?.[0]?.description
    }
  ];

  for(const r of rows){
    const tr = document.createElement("tr");
    tr.dataset.key = r.key;
    tr.innerHTML = `
      <td><strong>${r.label}</strong></td>
      <td>${r.min == null ? "—" : Math.round(r.min) + "°"}</td>
      <td>${r.max == null ? "—" : Math.round(r.max) + "°"}</td>
      <td style="display:flex; gap:10px; align-items:center;">
        <img src="https://openweathermap.org/img/wn/${r.icon || "01d"}.png" width="28" height="28" alt="">
        <span style="text-transform:capitalize; color:rgba(255,255,255,.82)">
          ${r.desc || "—"}
        </span>
      </td>
    `;
    tr.addEventListener("click", () => selectDay(r.key, data));
    dayRows.appendChild(tr);
  }

  yesterdayNote.hidden = false;
}

function selectDay(key, data){
  // highlight
  [...dayRows.querySelectorAll("tr")].forEach(tr => tr.classList.toggle("active", tr.dataset.key === key));

  hourlyTitle.hidden = false;
  hourlyGrid.hidden = false;
  hourlyGrid.innerHTML = "";

  const tz = data.timezone;

  if(key === "today"){
    hourlyHeading.textContent = "Hourly — Today";
    hourlySub.textContent = "Next 24 hours";
    renderHourlyCards(data.hourly?.slice(0, 24) || [], tz);
    return;
  }

  if(key === "yesterday"){
    hourlyHeading.textContent = "Hourly — Yesterday (last 24h)";
    hourlySub.textContent = "Approximation using last 24 hours (free-friendly)";
    renderHourlyCards(data.hourly?.slice(0, 24) || [], tz);
    return;
  }

  if(key === "tomorrow"){
    // From One Call: hourly has 48 hours. “Tomorrow” is next day; use hours 24..47
    hourlyHeading.textContent = "Hourly — Tomorrow";
    hourlySub.textContent = "Forecast hours 24–48";
    renderHourlyCards(data.hourly?.slice(24, 48) || [], tz);
    return;
  }
}

function renderHourlyCards(hours, tz){
  if(!hours.length){
    hourlyGrid.innerHTML = `<div class="error" style="grid-column:1/-1">No hourly data available.</div>`;
    return;
  }

  for(const h of hours){
    const div = document.createElement("div");
    div.className = "hcard";
    div.innerHTML = `
      <div class="ht">${fmtTime(h.dt, tz)}</div>
      <div class="hv">${Math.round(h.temp)}°</div>
      <img class="hi" src="https://openweathermap.org/img/wn/${h.weather?.[0]?.icon || "01d"}.png" alt="">
      <div class="ht" style="text-transform:capitalize">${h.weather?.[0]?.description || ""}</div>
    `;
    hourlyGrid.appendChild(div);
  }
}

// ====== EVENTS ======
searchBtn.addEventListener("click", loadWeatherByCityText);

geoBtn.addEventListener("click", () => {
  clearError();
  if(!navigator.geolocation) return showError("Geolocation not supported in this browser.");

  navigator.geolocation.getCurrentPosition(
    (pos) => loadWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    () => showError("Could not get your location (permission denied?).")
  );
});

// Optional: default city on load
(async function init(){
  // pick a friendly default
  cityInput.value = "Ulaanbaatar, MN";
  try{ await loadWeatherByCityText(); } catch(e){}
})();