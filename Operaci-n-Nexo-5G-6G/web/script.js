document.addEventListener("DOMContentLoaded", () => {
  const presets = {
    A: {
      label: "Escenario A",
      note: "Base urbana del enunciado",
      values: {
        bandwidthMHz: 20,
        noiseFigure: 7,
        powerTx: 43,
        gainTx: 18,
        gainRx: 0,
        extraLosses: 12,
        implLosses: 2,
        totalChannels: 100,
        intercept: 135,
        slope: 35,
        snr: 15,
        userDensity: 2500,
        callsPerHour: 3,
        durationMin: 2,
        sectors: 3,
        reuse: 3,
      },
    },
    B: {
      label: "Escenario B",
      note: "Base festival del enunciado",
      values: {
        bandwidthMHz: 20,
        noiseFigure: 7,
        powerTx: 43,
        gainTx: 18,
        gainRx: 0,
        extraLosses: 12,
        implLosses: 2,
        totalChannels: 100,
        intercept: 120,
        slope: 30,
        snr: 5,
        userDensity: 8000,
        callsPerHour: 5,
        durationMin: 1,
        sectors: 1,
        reuse: 1,
      },
    },
  };

  const state = { basePreset: "A" };
  const presetButtons = Array.from(document.querySelectorAll("[data-preset]"));
  const fieldInputs = Array.from(document.querySelectorAll("[data-field]"));

  const outputRefs = {
    scenarioChip: document.getElementById("scenario-chip"),
    presetStatus: document.getElementById("preset-status"),
    currentScenarioName: document.getElementById("current-scenario-name"),
    snrLive: document.getElementById("snr-live"),
    densityLive: document.getElementById("density-live"),
    reuseLive: document.getElementById("reuse-live"),
    noise: document.getElementById("out-noise"),
    sensitivity: document.getElementById("out-sensitivity"),
    lmax: document.getElementById("out-lmax"),
    rcov: document.getElementById("out-rcov"),
    auser: document.getElementById("out-auser"),
    adens: document.getElementById("out-adens"),
    capacity: document.getElementById("out-capacity"),
    rcap: document.getElementById("out-rcap"),
    design: document.getElementById("out-design"),
    limit: document.getElementById("out-limit"),
    reuseRatio: document.getElementById("out-reuse-ratio"),
    cellsKm2: document.getElementById("out-cells-km2"),
    distribution: document.getElementById("out-distribution"),
    splitting: document.getElementById("out-splitting"),
    formulaNoise: document.getElementById("formula-noise"),
    formulaSensitivity: document.getElementById("formula-sensitivity"),
    formulaLmax: document.getElementById("formula-lmax"),
    formulaRcov: document.getElementById("formula-rcov"),
    formulaTraffic: document.getElementById("formula-traffic"),
    formulaCapacity: document.getElementById("formula-capacity"),
    chartRadii: document.getElementById("chart-radii"),
    chartReuse: document.getElementById("chart-reuse"),
    chartArea: document.getElementById("chart-area"),
    reuseTableBody: document.getElementById("reuse-table-body"),
  };

  function formatNumber(value, digits) {
    return Number(value).toLocaleString("es-ES", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function clamp(value, min, max, fallback) {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, value));
  }

  function splitInteger(total, parts) {
    const base = Math.floor(total / parts);
    const remainder = total % parts;
    return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
  }

  function erlangBBlocking(channels, traffic) {
    let blocking = 1;
    for (let channel = 1; channel <= channels; channel += 1) {
      blocking = (traffic * blocking) / (channel + traffic * blocking);
    }
    return blocking;
  }

  function erlangBCapacity(channels, gos) {
    let low = 0;
    let high = Math.max(1, channels * 2);

    while (erlangBBlocking(channels, high) < gos) {
      high *= 2;
    }

    for (let iteration = 0; iteration < 200; iteration += 1) {
      const middle = (low + high) / 2;
      if (erlangBBlocking(channels, middle) > gos) {
        high = middle;
      } else {
        low = middle;
      }
    }

    return (low + high) / 2;
  }

  function syncField(name, value) {
    document.querySelectorAll(`[data-field="${name}"]`).forEach((element) => {
      if (element.value !== String(value)) {
        element.value = value;
      }
    });
  }

  function readModel() {
    const baseValues = presets[state.basePreset].values;
    const read = (name) => {
      const element = document.querySelector(`[data-field="${name}"]`);
      const numeric = parseFloat(element.value);
      return Number.isFinite(numeric) ? numeric : baseValues[name];
    };

    return {
      bandwidthMHz: clamp(read("bandwidthMHz"), 0.1, 500, baseValues.bandwidthMHz),
      noiseFigure: clamp(read("noiseFigure"), 0, 25, baseValues.noiseFigure),
      powerTx: clamp(read("powerTx"), 0, 80, baseValues.powerTx),
      gainTx: clamp(read("gainTx"), -10, 40, baseValues.gainTx),
      gainRx: clamp(read("gainRx"), -10, 20, baseValues.gainRx),
      extraLosses: clamp(read("extraLosses"), 0, 40, baseValues.extraLosses),
      implLosses: clamp(read("implLosses"), 0, 20, baseValues.implLosses),
      totalChannels: Math.max(1, Math.round(read("totalChannels"))),
      intercept: clamp(read("intercept"), 50, 200, baseValues.intercept),
      slope: clamp(read("slope"), 1, 80, baseValues.slope),
      snr: clamp(read("snr"), 0, 30, baseValues.snr),
      userDensity: clamp(read("userDensity"), 0, 20000, baseValues.userDensity),
      callsPerHour: clamp(read("callsPerHour"), 0, 20, baseValues.callsPerHour),
      durationMin: clamp(read("durationMin"), 0, 60, baseValues.durationMin),
      sectors: Math.max(1, Math.round(read("sectors"))),
      reuse: Math.max(1, Math.round(read("reuse"))),
      gos: 0.02,
    };
  }

  function analyzeModel(model) {
    const bandwidthHz = model.bandwidthMHz * 1e6;
    const noiseDbm = -174 + 10 * Math.log10(bandwidthHz) + model.noiseFigure;
    const sensitivityDbm = noiseDbm + model.snr + model.implLosses;
    const lmaxDb = model.powerTx + model.gainTx + model.gainRx - sensitivityDbm - model.extraLosses;
    const rCovKm = Math.pow(10, (lmaxDb - model.intercept) / model.slope);
    const aUserErl = model.callsPerHour * (model.durationMin / 60);
    const aDens = model.userDensity * aUserErl;

    const clusterChannels = splitInteger(model.totalChannels, model.reuse);
    const cellBreakdown = clusterChannels.map((cellChannels, index) => {
      const sectorChannels = splitInteger(cellChannels, model.sectors);
      const sectorCapacities = sectorChannels.map((channels) => erlangBCapacity(channels, model.gos));
      const totalCapacity = sectorCapacities.reduce((sum, capacity) => sum + capacity, 0);
      const label = model.sectors === 1
        ? `C${index + 1}: ${cellChannels} canales`
        : `C${index + 1}: ${cellChannels} canales -> sectores ${sectorChannels.join("-")}`;

      return {
        cellChannels,
        sectorChannels,
        sectorCapacities,
        totalCapacity,
        label,
      };
    });

    const avgCapacity = cellBreakdown.reduce((sum, cell) => sum + cell.totalCapacity, 0) / cellBreakdown.length;
    const macroArea = Math.PI * rCovKm * rCovKm;

    let areaByCapacity = Number.POSITIVE_INFINITY;
    let rCapKm = Number.POSITIVE_INFINITY;
    let designKm = rCovKm;
    let cellsPerKm2 = 1;
    let splitFactor = 1;
    let limit = "Cobertura";

    if (aDens > 0 && avgCapacity > 0) {
      areaByCapacity = avgCapacity / aDens;
      rCapKm = Math.sqrt(areaByCapacity / Math.PI);
      designKm = Math.min(rCovKm, rCapKm);
      cellsPerKm2 = Math.max(1, Math.ceil(1 / areaByCapacity));
      splitFactor = macroArea / areaByCapacity;
      limit = rCapKm < rCovKm ? "Capacidad" : "Cobertura";
    }

    return {
      noiseDbm,
      sensitivityDbm,
      lmaxDb,
      rCovKm,
      aUserErl,
      aDens,
      clusterChannels,
      cellBreakdown,
      avgCapacity,
      areaByCapacity,
      rCapKm,
      designKm,
      cellsPerKm2,
      splitFactor,
      macroArea,
      limit,
      reuseRatio: Math.sqrt(3 * model.reuse),
    };
  }

  function syncModelToInputs(model) {
    Object.entries(model).forEach(([field, value]) => {
      if (field !== "gos") {
        syncField(field, value);
      }
    });
  }

  function getMatchingPreset(model) {
    const tolerance = 1e-9;
    return Object.entries(presets).find(([, preset]) => {
      return Object.entries(preset.values).every(([key, value]) => Math.abs(model[key] - value) <= tolerance);
    });
  }

  function updatePresetMeta(model) {
    const match = getMatchingPreset(model);
    const currentPreset = match ? match[0] : null;

    presetButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.preset === currentPreset);
    });

    if (currentPreset) {
      outputRefs.scenarioChip.textContent = presets[currentPreset].label;
      outputRefs.presetStatus.textContent = presets[currentPreset].note;
      outputRefs.currentScenarioName.textContent = presets[currentPreset].label;
    } else {
      outputRefs.scenarioChip.textContent = "Escenario personalizado";
      outputRefs.presetStatus.textContent = `Ajuste libre sobre ${presets[state.basePreset].label}`;
      outputRefs.currentScenarioName.textContent = "Escenario personalizado";
    }
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function renderOutputs(model, analysis) {
    setText(outputRefs.snrLive, `${formatNumber(model.snr, 1)} dB`);
    setText(outputRefs.densityLive, formatNumber(model.userDensity, 0));
    setText(outputRefs.reuseLive, formatNumber(model.reuse, 0));

    setText(outputRefs.noise, `${formatNumber(analysis.noiseDbm, 2)} dBm`);
    setText(outputRefs.sensitivity, `${formatNumber(analysis.sensitivityDbm, 2)} dBm`);
    setText(outputRefs.lmax, `${formatNumber(analysis.lmaxDb, 2)} dB`);
    setText(outputRefs.rcov, `${formatNumber(analysis.rCovKm, 3)} km`);
    setText(outputRefs.auser, `${formatNumber(analysis.aUserErl, 3)} Erl`);
    setText(outputRefs.adens, `${formatNumber(analysis.aDens, 3)} Erl/km2`);
    setText(outputRefs.capacity, `${formatNumber(analysis.avgCapacity, 3)} Erl`);
    setText(outputRefs.rcap, Number.isFinite(analysis.rCapKm) ? `${formatNumber(analysis.rCapKm, 3)} km` : "No limita");
    setText(outputRefs.design, `${formatNumber(analysis.designKm, 3)} km`);
    setText(outputRefs.limit, analysis.limit);
    setText(outputRefs.reuseRatio, formatNumber(analysis.reuseRatio, 3));
    setText(outputRefs.cellsKm2, formatNumber(analysis.cellsPerKm2, 0));
    setText(outputRefs.distribution, analysis.cellBreakdown.map((cell) => cell.label).join(" | "));
    setText(outputRefs.splitting, `${formatNumber(analysis.splitFactor, 2)}x`);
  }

  function renderFormulas(model, analysis) {
    setText(
      outputRefs.formulaNoise,
      `N = -174 + 10 log10(${formatNumber(model.bandwidthMHz, 1)} x 10^6) + ${formatNumber(model.noiseFigure, 1)}\n= ${formatNumber(analysis.noiseDbm, 3)} dBm`
    );
    setText(
      outputRefs.formulaSensitivity,
      `Sens = ${formatNumber(analysis.noiseDbm, 3)} + ${formatNumber(model.snr, 1)} + ${formatNumber(model.implLosses, 1)}\n= ${formatNumber(analysis.sensitivityDbm, 3)} dBm`
    );
    setText(
      outputRefs.formulaLmax,
      `Lmax = ${formatNumber(model.powerTx, 1)} + ${formatNumber(model.gainTx, 1)} + ${formatNumber(model.gainRx, 1)} - (${formatNumber(analysis.sensitivityDbm, 3)}) - ${formatNumber(model.extraLosses, 1)}\n= ${formatNumber(analysis.lmaxDb, 3)} dB`
    );
    setText(
      outputRefs.formulaRcov,
      `Rcov = 10^((Lmax - ${formatNumber(model.intercept, 1)}) / ${formatNumber(model.slope, 1)})\n= ${formatNumber(analysis.rCovKm, 3)} km`
    );
    setText(
      outputRefs.formulaTraffic,
      `Auser = ${formatNumber(model.callsPerHour, 2)} x (${formatNumber(model.durationMin, 2)} / 60) = ${formatNumber(analysis.aUserErl, 3)} Erl\nAdens = ${formatNumber(model.userDensity, 0)} x ${formatNumber(analysis.aUserErl, 3)} = ${formatNumber(analysis.aDens, 3)} Erl/km2`
    );

    const capacityText = [
      `Cluster = [${analysis.clusterChannels.join(", ")}] canales`,
      `Cap media = ${formatNumber(analysis.avgCapacity, 3)} Erl`,
      Number.isFinite(analysis.areaByCapacity)
        ? `Rcap = sqrt((${formatNumber(analysis.avgCapacity, 3)} / ${formatNumber(analysis.aDens, 3)}) / pi) = ${formatNumber(analysis.rCapKm, 3)} km`
        : "Rcap = no limita por capacidad",
    ];
    setText(outputRefs.formulaCapacity, capacityText.join("\n"));
  }

  function renderEmptyChart(target, message) {
    target.innerHTML = `<div class="chart-empty">${message}</div>`;
  }

  function renderBarChart(target, labels, values, colors, unit) {
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length === 0) {
      renderEmptyChart(target, "No hay datos numericos suficientes para dibujar la grafica.");
      return;
    }

    const width = 760;
    const height = 320;
    const left = 64;
    const right = 24;
    const top = 26;
    const bottom = 58;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(...finiteValues, 0.001) * 1.18;
    const band = plotWidth / labels.length;
    const barWidth = band * 0.56;

    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = (maxValue / 4) * index;
      const y = top + plotHeight - (value / maxValue) * plotHeight;
      return `
        <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
        <text x="${left - 10}" y="${y + 4}" text-anchor="end" fill="#acc4d5" font-size="11">${formatNumber(value, value < 1 ? 3 : 1)}</text>`;
    }).join("");

    const bars = values.map((value, index) => {
      const safeValue = Number.isFinite(value) ? value : 0;
      const x = left + index * band + (band - barWidth) / 2;
      const barHeight = (safeValue / maxValue) * plotHeight;
      const y = top + plotHeight - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="18" fill="${colors[index]}" />
        <text x="${x + barWidth / 2}" y="${y - 10}" text-anchor="middle" fill="#f5efe4" font-size="12" font-weight="700">${formatNumber(safeValue, safeValue < 1 ? 3 : 1)} ${unit}</text>
        <text x="${x + barWidth / 2}" y="${height - 22}" text-anchor="middle" fill="#acc4d5" font-size="12">${labels[index]}</text>`;
    }).join("");

    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" aria-label="Grafica de barras de radios">
        ${grid}
        ${bars}
      </svg>`;
  }

  function renderReuseChart(target, sweep, selectedReuse) {
    const finiteCaps = sweep.map((item) => item.capacity).filter(Number.isFinite);
    const finiteRadii = sweep.map((item) => item.design).filter(Number.isFinite);
    if (finiteCaps.length === 0 || finiteRadii.length === 0) {
      renderEmptyChart(target, "No hay barrido de reutilizacion disponible.");
      return;
    }

    const width = 760;
    const height = 340;
    const left = 62;
    const right = 56;
    const top = 26;
    const bottom = 58;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxCapacity = Math.max(...finiteCaps, 0.001) * 1.15;
    const maxRadius = Math.max(...finiteRadii, 0.001) * 1.18;
    const band = plotWidth / sweep.length;
    const barWidth = band * 0.5;

    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = (maxCapacity / 4) * index;
      const y = top + plotHeight - (value / maxCapacity) * plotHeight;
      const radiusValue = (maxRadius / 4) * index;
      return `
        <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
        <text x="${left - 10}" y="${y + 4}" text-anchor="end" fill="#79e9ff" font-size="11">${formatNumber(value, value < 1 ? 3 : 1)}</text>
        <text x="${width - right + 10}" y="${y + 4}" fill="#ffb84d" font-size="11">${formatNumber(radiusValue, 3)}</text>`;
    }).join("");

    const bars = sweep.map((item, index) => {
      const x = left + index * band + (band - barWidth) / 2;
      const barHeight = (item.capacity / maxCapacity) * plotHeight;
      const y = top + plotHeight - barHeight;
      const fill = item.reuse === selectedReuse ? "#ffb84d" : "rgba(121,233,255,0.72)";
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="16" fill="${fill}" />
        <text x="${x + barWidth / 2}" y="${height - 22}" text-anchor="middle" fill="#acc4d5" font-size="12">N=${item.reuse}</text>`;
    }).join("");

    const points = sweep.map((item, index) => {
      const x = left + index * band + band / 2;
      const y = top + plotHeight - (item.design / maxRadius) * plotHeight;
      return { x, y, reuse: item.reuse, design: item.design };
    });
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const pointMarkup = points.map((point) => {
      const radius = point.reuse === selectedReuse ? 7 : 5;
      const fill = point.reuse === selectedReuse ? "#ff6f5e" : "#ffd9a0";
      return `<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="${fill}" stroke="#07131d" stroke-width="2" />`;
    }).join("");

    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" aria-label="Explorador de reutilizacion">
        ${grid}
        ${bars}
        <path d="${path}" fill="none" stroke="#ff6f5e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${pointMarkup}
        <text x="${left}" y="16" fill="#79e9ff" font-size="12">Capacidad media por celda (Erl)</text>
        <text x="${width - 170}" y="16" fill="#ffb84d" font-size="12">Radio de diseno (km)</text>
      </svg>`;
  }

  function renderAreaChart(target, analysis) {
    if (!Number.isFinite(analysis.areaByCapacity)) {
      renderEmptyChart(target, "La capacidad no limita con los parametros actuales.");
      return;
    }

    const width = 980;
    const height = 320;
    const left = 180;
    const right = 36;
    const top = 34;
    const bottom = 48;
    const plotWidth = width - left - right;
    const baseValues = [analysis.macroArea, analysis.areaByCapacity];
    const maxValue = Math.max(...baseValues, 0.001);
    const scale = (value) => Math.max(18, (Math.log10(value + 1) / Math.log10(maxValue + 1)) * plotWidth);

    const rows = [
      { label: "Area por cobertura", value: analysis.macroArea, color: "#79e9ff", y: 88 },
      { label: "Area por capacidad", value: analysis.areaByCapacity, color: "#ff6f5e", y: 184 },
    ].map((row) => {
      const barWidth = scale(row.value);
      return `
        <text x="${left - 16}" y="${row.y + 14}" text-anchor="end" fill="#f5efe4" font-size="14">${row.label}</text>
        <rect x="${left}" y="${row.y}" width="${barWidth}" height="30" rx="15" fill="${row.color}" opacity="0.86" />
        <text x="${left + barWidth + 14}" y="${row.y + 20}" fill="#f5efe4" font-size="13">${formatNumber(row.value, 3)} km2</text>`;
    }).join("");

    target.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" aria-label="Comparacion de areas">
        <text x="${left}" y="18" fill="#acc4d5" font-size="12">Escala logaritmica suave para hacer visibles diferencias grandes de area</text>
        ${rows}
        <text x="${left}" y="274" fill="#ffb84d" font-size="13">Factor teorico de splitting = ${formatNumber(analysis.splitFactor, 2)}x</text>
        <text x="${left}" y="298" fill="#acc4d5" font-size="12">Area macro = pi x Rcov^2 | Area micro = Capacidad / Densidad de trafico</text>
      </svg>`;
  }

  function renderSweepTable(sweep, selectedReuse) {
    outputRefs.reuseTableBody.innerHTML = sweep.map((item) => {
      const rowClass = item.reuse === selectedReuse ? "selected-row" : "";
      return `
        <tr class="${rowClass}">
          <td>${item.reuse}</td>
          <td>${formatNumber(item.capacity, 3)} Erl</td>
          <td>${formatNumber(item.design, 3)} km</td>
        </tr>`;
    }).join("");
  }

  function render(model, analysis) {
    updatePresetMeta(model);
    renderOutputs(model, analysis);
    renderFormulas(model, analysis);

    renderBarChart(
      outputRefs.chartRadii,
      ["Cobertura", "Capacidad", "Diseno"],
      [analysis.rCovKm, analysis.rCapKm, analysis.designKm],
      ["#79e9ff", "#ff6f5e", "#ffb84d"],
      "km"
    );

    const sweep = Array.from({ length: 7 }, (_, index) => {
      const reuse = index + 1;
      const scenario = analyzeModel({ ...model, reuse });
      return { reuse, capacity: scenario.avgCapacity, design: scenario.designKm };
    });

    renderReuseChart(outputRefs.chartReuse, sweep, model.reuse);
    renderAreaChart(outputRefs.chartArea, analysis);
    renderSweepTable(sweep, model.reuse);
  }

  function rerender() {
    const model = readModel();
    syncModelToInputs(model);
    const analysis = analyzeModel(model);
    render(model, analysis);
  }

  function applyPreset(name) {
    state.basePreset = name;
    const { values } = presets[name];
    Object.entries(values).forEach(([field, value]) => syncField(field, value));
    rerender();
  }

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  fieldInputs.forEach((input) => {
    input.addEventListener("input", () => {
      syncField(input.dataset.field, input.value);
      rerender();
    });
  });

  applyPreset("A");
});
