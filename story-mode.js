(() => {
  const DATA_URL = "assets/world-countries-50m.json";
  const MAP_WIDTH = 1200;
  const MAP_HEIGHT = 620;
  const WEST_INDIES_CODES = new Set(["JAM", "BRB", "TTO", "GUY", "ATG", "DMA", "GRD", "KNA", "LCA", "VCT"]);
  const FLAG_IMAGES = {
    IND: "assets/flags/IN.svg",
    AUS: "assets/flags/AU.svg",
    ZAF: "assets/flags/ZA.svg",
    GBR: "assets/flags/ENG.svg",
    NZL: "assets/flags/NZ.svg",
    PAK: "assets/flags/PK.svg",
    LKA: "assets/flags/LK.svg",
    BGD: "assets/flags/BD.svg",
    AFG: "assets/flags/AF.svg",
    ZWE: "assets/flags/ZW.svg"
  };

  const COUNTRIES = [
    { code: "IND", id: "356", name: "India", region: "Asia", direct: true, alpha2: "IN" },
    { code: "PAK", id: "586", name: "Pakistan", region: "Asia", direct: true, alpha2: "PK" },
    { code: "LKA", id: "144", name: "Sri Lanka", region: "Asia", direct: true, alpha2: "LK" },
    { code: "BGD", id: "050", name: "Bangladesh", region: "Asia", direct: true, alpha2: "BD" },
    { code: "AFG", id: "004", name: "Afghanistan", region: "Asia", direct: true, alpha2: "AF" },
    { code: "OMN", id: "512", name: "Oman", region: "Asia", alpha2: "OM" },
    { code: "ARE", id: "784", name: "United Arab Emirates", region: "Asia", alpha2: "AE" },
    { code: "KWT", id: "414", name: "Kuwait", region: "Asia", alpha2: "KW" },
    { code: "NPL", id: "524", name: "Nepal", region: "Asia", alpha2: "NP" },
    { code: "ZAF", id: "710", name: "South Africa", region: "Africa", direct: true, alpha2: "ZA" },
    { code: "ZWE", id: "716", name: "Zimbabwe", region: "Africa", direct: true, alpha2: "ZW" },
    { code: "NAM", id: "516", name: "Namibia", region: "Africa", alpha2: "NA" },
    { code: "UGA", id: "800", name: "Uganda", region: "Africa", alpha2: "UG" },
    { code: "GBR", id: "826", name: "England", mapName: "England & Scotland", region: "Europe", direct: true, alpha2: "GB" },
    { code: "IRL", id: "372", name: "Ireland", region: "Europe", alpha2: "IE" },
    { code: "NLD", id: "528", name: "Netherlands", region: "Europe", alpha2: "NL" },
    { code: "ITA", id: "380", name: "Italy", region: "Europe", alpha2: "IT" },
    { code: "JEY", id: "832", name: "Jersey", region: "Europe", alpha2: "JE" },
    { code: "USA", id: "840", name: "United States", region: "Americas", alpha2: "US" },
    { code: "CAN", id: "124", name: "Canada", region: "Americas", alpha2: "CA" },
    { code: "JAM", id: "388", name: "Jamaica", region: "Americas", alpha2: "JM", cricketName: "West Indies" },
    { code: "BRB", id: "052", name: "Barbados", region: "Americas", alpha2: "BB", cricketName: "West Indies" },
    { code: "TTO", id: "780", name: "Trinidad & Tobago", region: "Americas", alpha2: "TT", cricketName: "West Indies" },
    { code: "GUY", id: "328", name: "Guyana", region: "Americas", alpha2: "GY", cricketName: "West Indies" },
    { code: "ATG", id: "028", name: "Antigua & Barbuda", region: "Americas", alpha2: "AG", cricketName: "West Indies" },
    { code: "DMA", id: "212", name: "Dominica", region: "Americas", alpha2: "DM", cricketName: "West Indies" },
    { code: "GRD", id: "308", name: "Grenada", region: "Americas", alpha2: "GD", cricketName: "West Indies" },
    { code: "KNA", id: "659", name: "St. Kitts & Nevis", region: "Americas", alpha2: "KN", cricketName: "West Indies" },
    { code: "LCA", id: "662", name: "Saint Lucia", region: "Americas", alpha2: "LC", cricketName: "West Indies" },
    { code: "VCT", id: "670", name: "St. Vincent & Grenadines", region: "Americas", alpha2: "VC", cricketName: "West Indies" },
    { code: "AUS", id: "036", name: "Australia", region: "Oceania", direct: true, alpha2: "AU" },
    { code: "NZL", id: "554", name: "New Zealand", region: "Oceania", direct: true, alpha2: "NZ" }
  ].map((country) => ({
    ...country,
    teamCode: country.cricketName === "West Indies" ? "WI" : country.code,
    cricketName: country.cricketName || country.name
  }));

  const ISO_BY_NUMERIC_ID = new Map(COUNTRIES.map((country) => [country.id, country.code]));
  const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));
  const REGION_ORDER = ["Asia", "Africa", "Europe", "Americas", "Oceania"];

  function flagMarkup(country) {
    const image = FLAG_IMAGES[country.code] || `assets/flags/${country.alpha2.toLowerCase()}.svg`;
    return `<img src="${image}" alt="" aria-hidden="true">`;
  }

  function renderCountryList(root, chooseCountry, hoverCountry) {
    root.replaceChildren();
    for (const region of REGION_ORDER) {
      const countries = COUNTRIES.filter((country) => country.region === region);
      const section = document.createElement("section");
      section.className = "story-country-group";
      const heading = document.createElement("h3");
      heading.textContent = region === "Americas" ? "Americas · West Indies" : region;
      const grid = document.createElement("div");
      grid.className = "story-country-grid";

      for (const country of countries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "story-country-option";
        button.dataset.iso3 = country.code;
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", `${country.name}, ${country.direct ? "direct entrant" : "qualification contender"}`);

        const flag = document.createElement("span");
        flag.className = "story-country-flag";
        flag.innerHTML = flagMarkup(country);
        const copy = document.createElement("span");
        copy.className = "story-country-copy";
        const name = document.createElement("span");
        name.className = "story-country-name";
        name.textContent = country.name;
        const entry = document.createElement("span");
        entry.className = "story-country-entry";
        entry.textContent = country.direct ? "Direct entrant" : "Qualifier";
        copy.append(name, entry);
        button.append(flag, copy);
        button.addEventListener("click", () => chooseCountry(country.code));
        button.addEventListener("pointerenter", () => hoverCountry(country.code));
        button.addEventListener("pointerleave", () => hoverCountry(null));
        grid.append(button);
      }

      section.append(heading, grid);
      root.append(section);
    }
  }

  function numericId(value) {
    return String(value ?? "").padStart(3, "0");
  }

  function mount({ mapRoot, countryListRoot, onSelectTeam = () => {} }) {
    let svg;
    let mapGroup;
    let tooltip;
    let selectionBadge;
    let selectedIso = null;
    let hoveredIso = null;
    let currentScale = 1;
    let currentCenter = [MAP_WIDTH / 2, MAP_HEIGHT / 2];
    let pathByCode = new Map();
    let listButtons = new Map();
    let countryByCode = COUNTRY_BY_CODE;
    const status = document.createElement("p");
    status.className = "story-map-status";
    status.setAttribute("role", "status");
    status.textContent = "Loading world map…";
    mapRoot.replaceChildren(status);

    function highlightedCodes(iso3) {
      return WEST_INDIES_CODES.has(iso3) ? WEST_INDIES_CODES : new Set(iso3 ? [iso3] : []);
    }

    function refreshShapes() {
      const selectedCodes = highlightedCodes(selectedIso);
      const hoveredCodes = highlightedCodes(hoveredIso);
      for (const [code, paths] of pathByCode) {
        for (const path of paths) {
          path.classList.toggle("is-selected", selectedCodes.has(code));
          path.classList.toggle("is-hovered", !selectedCodes.has(code) && hoveredCodes.has(code));
        }
      }
      for (const [code, button] of listButtons) {
        button.setAttribute("aria-pressed", String(code === selectedIso));
        button.classList.toggle("is-hovered", hoveredCodes.has(code));
      }
    }

    function selectionFor(iso3) {
      const country = countryByCode.get(iso3);
      if (!country) return null;
      const isWestIndies = country.teamCode === "WI";
      return {
        country,
        teamCode: country.teamCode,
        teamName: country.cricketName,
        detailLabel: isWestIndies
          ? `${country.name} · Qualification contender`
          : `${country.mapName ? `${country.mapName} · ` : ""}${country.direct ? "Direct entrant" : "Qualification contender"}`
      };
    }

    function updateSelectionBadge(iso3) {
      const selected = selectionFor(iso3);
      if (!selected) {
        selectionBadge.hidden = true;
        return;
      }
      selectionBadge.hidden = false;
      const flag = selectionBadge.querySelector(".story-country-flag");
      flag.innerHTML = flagMarkup(selected.country);
      selectionBadge.querySelector(".story-map-selection-name").textContent = selected.teamName;
      selectionBadge.querySelector(".story-map-selection-region").textContent = selected.detailLabel;
    }

    function showTooltip(iso3, clientX, clientY) {
      const selected = selectionFor(iso3);
      if (!selected) return;
      const flag = tooltip.querySelector(".story-country-flag");
      flag.innerHTML = flagMarkup(selected.country);
      tooltip.querySelector(".story-map-tooltip-name").textContent = selected.teamName;
      tooltip.hidden = false;
      const rect = mapRoot.getBoundingClientRect();
      tooltip.style.left = `${Math.max(100, Math.min(rect.width - 100, clientX - rect.left))}px`;
      tooltip.style.top = `${Math.max(48, Math.min(rect.height - 14, clientY - rect.top))}px`;
    }

    function hideTooltip() {
      tooltip.hidden = true;
    }

    function applyTransform() {
      const tx = MAP_WIDTH / 2 - currentCenter[0] * currentScale;
      const ty = MAP_HEIGHT / 2 - currentCenter[1] * currentScale;
      mapGroup.setAttribute("transform", `translate(${tx} ${ty}) scale(${currentScale})`);
    }

    function boundsFor(iso3) {
      const targetCodes = WEST_INDIES_CODES.has(iso3) ? [...WEST_INDIES_CODES] : [iso3];
      const paths = targetCodes.flatMap((code) => pathByCode.get(code) || []);
      const boxes = paths.map((path) => path.getBBox()).filter((box) => box.width || box.height);
      if (!boxes.length) return null;
      const left = Math.min(...boxes.map((box) => box.x));
      const top = Math.min(...boxes.map((box) => box.y));
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }

    function zoomTo(iso3) {
      const bounds = boundsFor(iso3);
      if (!bounds) return resetZoom();
      const center = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
      const safeWidth = Math.max(bounds.width, 2.5);
      const safeHeight = Math.max(bounds.height, 2.5);
      const fit = Math.min((MAP_WIDTH * .62) / safeWidth, (MAP_HEIGHT * .58) / safeHeight);
      currentScale = Math.max(1.35, Math.min(24, fit));
      currentCenter = center;
      applyTransform();
    }

    function resetZoom() {
      currentScale = 1;
      currentCenter = [MAP_WIDTH / 2, MAP_HEIGHT / 2];
      applyTransform();
    }

    function zoomBy(factor) {
      currentScale = Math.max(1, Math.min(24, currentScale * factor));
      applyTransform();
    }

    function selectCountry(iso3) {
      const selected = selectionFor(iso3);
      if (!selected) return;
      selectedIso = iso3;
      hoveredIso = null;
      refreshShapes();
      updateSelectionBadge(iso3);
      hideTooltip();
      zoomTo(iso3);
      onSelectTeam(selected.teamCode);
    }

    function hoverCountry(iso3, event) {
      hoveredIso = iso3;
      refreshShapes();
      if (!iso3) return hideTooltip();
      if (event) showTooltip(iso3, event.clientX, event.clientY);
    }

    renderCountryList(countryListRoot, selectCountry, (iso3) => hoverCountry(iso3));
    listButtons = new Map([...countryListRoot.querySelectorAll("[data-iso3]")].map((button) => [button.dataset.iso3, button]));
    mapRoot.innerHTML = `
      <svg class="story-world-svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="group" aria-labelledby="storyWorldMapLabel" preserveAspectRatio="xMidYMid meet">
        <title id="storyWorldMapLabel">World map of eligible cricket countries</title>
        <g class="story-world-shapes"></g>
      </svg>
      <div class="story-map-tooltip" role="status" hidden><span class="story-country-flag"></span><span class="story-map-tooltip-name"></span></div>
      <div class="story-map-selection" aria-live="polite" hidden><span class="story-country-flag"></span><span class="story-map-selection-copy"><span class="story-map-selection-name"></span><span class="story-map-selection-region"></span></span></div>
      <p class="story-map-status" role="status">Loading world map…</p>`;
    svg = mapRoot.querySelector("svg");
    mapGroup = mapRoot.querySelector(".story-world-shapes");
    tooltip = mapRoot.querySelector(".story-map-tooltip");
    selectionBadge = mapRoot.querySelector(".story-map-selection");

    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Map data request failed (${response.status})`);
        return response.json();
      })
      .then((topology) => {
        if (!window.d3?.geoEquirectangular || !window.topojson?.feature) {
          throw new Error("Map projection libraries are unavailable");
        }
        const projection = window.d3.geoEquirectangular().fitExtent(
          [[26, 14], [MAP_WIDTH - 26, MAP_HEIGHT - 14]],
          { type: "Sphere" }
        );
        const pathGenerator = window.d3.geoPath(projection);
        const geometries = window.topojson.feature(topology, topology.objects.countries).features;
        const pathNodes = [];
        pathByCode = new Map();
        for (const geometry of geometries) {
          const id = numericId(geometry.id);
          const iso3 = ISO_BY_NUMERIC_ID.get(id);
          const country = iso3 ? countryByCode.get(iso3) : null;
          const pathData = pathGenerator(geometry);
          if (!pathData) continue;
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", pathData);
          path.setAttribute("class", "story-world-country");
          path.setAttribute("fill-rule", "evenodd");
          if (country) {
            path.dataset.iso3 = country.code;
            path.dataset.eligible = "true";
            path.setAttribute("role", "button");
            path.setAttribute("tabindex", "0");
            path.setAttribute("aria-label", `${country.name}, ${country.direct ? "direct entrant" : "qualification contender"}`);
            if (!pathByCode.has(country.code)) pathByCode.set(country.code, []);
            pathByCode.get(country.code).push(path);
            path.addEventListener("pointerenter", (event) => hoverCountry(country.code, event));
            path.addEventListener("pointermove", (event) => showTooltip(country.code, event.clientX, event.clientY));
            path.addEventListener("pointerleave", () => hoverCountry(null));
            path.addEventListener("click", () => selectCountry(country.code));
            path.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectCountry(country.code);
              }
            });
          } else {
            path.setAttribute("aria-hidden", "true");
          }
          pathNodes.push(path);
        }
        mapGroup.replaceChildren(...pathNodes);
        mapRoot.querySelector(".story-map-status").hidden = true;
        resetZoom();
      })
      .catch((error) => {
        const mapStatus = mapRoot.querySelector(".story-map-status");
        mapStatus.textContent = "The world map could not be loaded.";
        mapRoot.dataset.error = error.message;
      });

    document.querySelector("#storyMapReset").addEventListener("click", resetZoom);
    document.querySelector("#storyMapZoomIn").addEventListener("click", () => zoomBy(1.35));
    document.querySelector("#storyMapZoomOut").addEventListener("click", () => zoomBy(.74));

    return {
      select: selectCountry,
      reset: resetZoom,
      getSelectedTeam() { return selectedIso ? selectionFor(selectedIso)?.teamCode || null : null; }
    };
  }

  window.InteractiveWorldMap = Object.freeze({ mount, countries: COUNTRIES.map((country) => ({ ...country })) });
})();
