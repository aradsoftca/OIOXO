/**
 * oioxo engine: unit conversion
 *
 * Pure on-device math, zero network. Covers length / mass / volume / speed /
 * time (factor-based) plus temperature (offset-based for C/F/K). Same
 * conversion tables planned for the xonvert app/calculators/unit-converter
 * page so both surfaces share the source of truth.
 *
 * Exposes window.oioxoEngines.units = { convert, parse, GROUPS }.
 *
 *   parse('5 miles to km') -> { value, from, to }
 *   convert(5, 'miles', 'km') -> 8.04672
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.units) return;

  const GROUPS = {
    length: {
      base: 'm',
      aliases: {
        meter:'m', meters:'m', metre:'m', metres:'m', m:'m',
        km:'km', kilometer:'km', kilometers:'km', kilometre:'km', kilometres:'km',
        cm:'cm', centimeter:'cm', centimeters:'cm',
        mm:'mm', millimeter:'mm', millimeters:'mm',
        mi:'mi', mile:'mi', miles:'mi',
        yd:'yd', yard:'yd', yards:'yd',
        ft:'ft', foot:'ft', feet:'ft',
        in:'in', inch:'in', inches:'in',
        nm:'nm', nautical:'nm', nauticalmile:'nm',
      },
      toBase: { m:1, km:1000, cm:0.01, mm:0.001, mi:1609.344, yd:0.9144, ft:0.3048, in:0.0254, nm:1852 },
    },
    mass: {
      base: 'kg',
      aliases: {
        kg:'kg', kilo:'kg', kilos:'kg', kilogram:'kg', kilograms:'kg',
        g:'g', gram:'g', grams:'g',
        mg:'mg', milligram:'mg', milligrams:'mg',
        t:'t', ton:'t', tonne:'t', tonnes:'t', tons:'t',
        lb:'lb', lbs:'lb', pound:'lb', pounds:'lb',
        oz:'oz', ounce:'oz', ounces:'oz',
        st:'st', stone:'st',
      },
      toBase: { kg:1, g:0.001, mg:0.000001, t:1000, lb:0.45359237, oz:0.028349523125, st:6.35029318 },
    },
    volume: {
      base: 'l',
      aliases: {
        l:'l', litre:'l', liter:'l', litres:'l', liters:'l',
        ml:'ml', millilitre:'ml', milliliter:'ml',
        gal:'gal', gallon:'gal', gallons:'gal',
        qt:'qt', quart:'qt', quarts:'qt',
        pt:'pt', pint:'pt', pints:'pt',
        cup:'cup', cups:'cup',
        tbsp:'tbsp', tablespoon:'tbsp', tablespoons:'tbsp',
        tsp:'tsp', teaspoon:'tsp', teaspoons:'tsp',
        floz:'floz', 'fl-oz':'floz', flozUS:'floz',
      },
      toBase: { l:1, ml:0.001, gal:3.785411784, qt:0.946352946, pt:0.473176473, cup:0.2365882365, tbsp:0.01478676478125, tsp:0.00492892159375, floz:0.0295735296875 },
    },
    speed: {
      base: 'mps',
      aliases: {
        mps:'mps', 'm/s':'mps',
        kph:'kph', 'km/h':'kph', kmh:'kph',
        mph:'mph',
        knot:'knot', knots:'knot', kn:'knot',
      },
      toBase: { mps:1, kph:0.277777778, mph:0.44704, knot:0.514444444 },
    },
    time: {
      base: 's',
      aliases: {
        s:'s', sec:'s', secs:'s', second:'s', seconds:'s',
        min:'min', minute:'min', minutes:'min',
        h:'h', hr:'h', hrs:'h', hour:'h', hours:'h',
        d:'d', day:'d', days:'d',
        wk:'wk', week:'wk', weeks:'wk',
        mo:'mo', month:'mo', months:'mo',
        yr:'yr', year:'yr', years:'yr',
      },
      toBase: { s:1, min:60, h:3600, d:86400, wk:604800, mo:2629746, yr:31556952 },
    },
  };
  const TEMP_ALIAS = { c:'c', '°c':'c', celsius:'c', f:'f', '°f':'f', fahrenheit:'f', k:'k', kelvin:'k' };

  function normalizeUnit(u){ return (u || '').toLowerCase().replace(/\s+/g, ''); }

  function lookupGroup(unit){
    const u = normalizeUnit(unit);
    for (const [name, g] of Object.entries(GROUPS)){
      if (g.aliases[u]) return { name, group: g, canon: g.aliases[u] };
    }
    if (TEMP_ALIAS[u]) return { name: 'temperature', group: null, canon: TEMP_ALIAS[u] };
    return null;
  }

  function convert(value, fromUnit, toUnit){
    if (typeof value !== 'number' || !isFinite(value)) return null;
    const f = lookupGroup(fromUnit);
    const t = lookupGroup(toUnit);
    if (!f || !t) return null;
    if (f.name !== t.name) return null;
    if (f.name === 'temperature'){
      let asC;
      if (f.canon === 'c') asC = value;
      else if (f.canon === 'f') asC = (value - 32) * 5/9;
      else asC = value - 273.15;
      if (t.canon === 'c') return asC;
      if (t.canon === 'f') return asC * 9/5 + 32;
      return asC + 273.15;
    }
    return value * f.group.toBase[f.canon] / f.group.toBase[t.canon];
  }

  function parse(text){
    if (!text || typeof text !== 'string') return null;
    const norm = text.trim().toLowerCase().replace(/,/g, '');   // strip thousands-commas, KEEP spaces
    const m = norm.match(/^(-?\d+(?:\.\d+)?)\s*([a-z°/²³µμ]+)\s+(?:to|in|=|->)\s+([a-z°/²³µμ]+)\??$/i);
    if (!m) return null;
    const value = parseFloat(m[1]);
    if (!isFinite(value)) return null;
    return { value, from: m[2], to: m[3] };
  }

  function format(n){
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (Math.abs(n) >= 1e6 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) return n.toExponential(4);
    return Number(n.toFixed(6)).toString();
  }

  window.oioxoEngines.units = { convert, parse, format, GROUPS, lookupGroup };
})();
