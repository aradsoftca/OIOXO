/**
 * oioxo engine: periodic table. 118 elements embedded inline. Pure
 * on-device, zero network, works offline.
 *
 * Exposes window.oioxoEngines.element = { lookup, all, categoryColor }.
 *   lookup('Au')        -> { num, sym, name, mass, period, group, cat, ip, mp, bp }
 *   lookup('gold')      -> same
 *   lookup('79')        -> same (number string OK)
 *   lookup('element 79')-> same
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoEngines = window.oioxoEngines || {};
  if (window.oioxoEngines.element) return;

  // [num, sym, name, mass, period, group, cat, ip(eV), mp(K), bp(K)]
  const RAW = [
    [1,'H','Hydrogen',1.008,1,'1','nonmetal',13.598,14,20],
    [2,'He','Helium',4.0026,1,'18','noble gas',24.587,1,4],
    [3,'Li','Lithium',6.94,2,'1','alkali metal',5.392,454,1603],
    [4,'Be','Beryllium',9.0122,2,'2','alkaline earth metal',9.323,1560,2742],
    [5,'B','Boron',10.81,2,'13','metalloid',8.298,2349,4200],
    [6,'C','Carbon',12.011,2,'14','nonmetal',11.260,3823,4098],
    [7,'N','Nitrogen',14.007,2,'15','nonmetal',14.534,63,77],
    [8,'O','Oxygen',15.999,2,'16','nonmetal',13.618,54,90],
    [9,'F','Fluorine',18.998,2,'17','halogen',17.422,53,85],
    [10,'Ne','Neon',20.180,2,'18','noble gas',21.564,24,27],
    [11,'Na','Sodium',22.990,3,'1','alkali metal',5.139,371,1156],
    [12,'Mg','Magnesium',24.305,3,'2','alkaline earth metal',7.646,923,1363],
    [13,'Al','Aluminum',26.982,3,'13','post-transition metal',5.986,933,2792],
    [14,'Si','Silicon',28.085,3,'14','metalloid',8.152,1687,3538],
    [15,'P','Phosphorus',30.974,3,'15','nonmetal',10.487,317,553],
    [16,'S','Sulfur',32.06,3,'16','nonmetal',10.360,388,718],
    [17,'Cl','Chlorine',35.45,3,'17','halogen',12.968,172,239],
    [18,'Ar','Argon',39.948,3,'18','noble gas',15.760,84,87],
    [19,'K','Potassium',39.098,4,'1','alkali metal',4.341,337,1032],
    [20,'Ca','Calcium',40.078,4,'2','alkaline earth metal',6.113,1115,1757],
    [21,'Sc','Scandium',44.956,4,'3','transition metal',6.561,1814,3109],
    [22,'Ti','Titanium',47.867,4,'4','transition metal',6.828,1941,3560],
    [23,'V','Vanadium',50.942,4,'5','transition metal',6.746,2183,3680],
    [24,'Cr','Chromium',51.996,4,'6','transition metal',6.767,2180,2944],
    [25,'Mn','Manganese',54.938,4,'7','transition metal',7.434,1519,2334],
    [26,'Fe','Iron',55.845,4,'8','transition metal',7.902,1811,3134],
    [27,'Co','Cobalt',58.933,4,'9','transition metal',7.881,1768,3200],
    [28,'Ni','Nickel',58.693,4,'10','transition metal',7.640,1728,3186],
    [29,'Cu','Copper',63.546,4,'11','transition metal',7.726,1358,2835],
    [30,'Zn','Zinc',65.38,4,'12','transition metal',9.394,693,1180],
    [31,'Ga','Gallium',69.723,4,'13','post-transition metal',5.999,303,2477],
    [32,'Ge','Germanium',72.630,4,'14','metalloid',7.900,1211,3106],
    [33,'As','Arsenic',74.922,4,'15','metalloid',9.815,1090,887],
    [34,'Se','Selenium',78.971,4,'16','nonmetal',9.752,494,958],
    [35,'Br','Bromine',79.904,4,'17','halogen',11.814,266,332],
    [36,'Kr','Krypton',83.798,4,'18','noble gas',13.999,116,120],
    [37,'Rb','Rubidium',85.468,5,'1','alkali metal',4.177,312,961],
    [38,'Sr','Strontium',87.62,5,'2','alkaline earth metal',5.695,1050,1655],
    [39,'Y','Yttrium',88.906,5,'3','transition metal',6.217,1799,3609],
    [40,'Zr','Zirconium',91.224,5,'4','transition metal',6.634,2128,4682],
    [41,'Nb','Niobium',92.906,5,'5','transition metal',6.759,2750,5017],
    [42,'Mo','Molybdenum',95.95,5,'6','transition metal',7.092,2896,4912],
    [43,'Tc','Technetium',98,5,'7','transition metal',7.28,2430,4538],
    [44,'Ru','Ruthenium',101.07,5,'8','transition metal',7.361,2607,4423],
    [45,'Rh','Rhodium',102.91,5,'9','transition metal',7.459,2237,3968],
    [46,'Pd','Palladium',106.42,5,'10','transition metal',8.337,1828,3236],
    [47,'Ag','Silver',107.87,5,'11','transition metal',7.576,1235,2435],
    [48,'Cd','Cadmium',112.41,5,'12','transition metal',8.994,594,1040],
    [49,'In','Indium',114.82,5,'13','post-transition metal',5.786,430,2345],
    [50,'Sn','Tin',118.71,5,'14','post-transition metal',7.344,505,2875],
    [51,'Sb','Antimony',121.76,5,'15','metalloid',8.609,904,1860],
    [52,'Te','Tellurium',127.60,5,'16','metalloid',9.010,723,1261],
    [53,'I','Iodine',126.90,5,'17','halogen',10.451,387,457],
    [54,'Xe','Xenon',131.29,5,'18','noble gas',12.130,161,165],
    [55,'Cs','Cesium',132.91,6,'1','alkali metal',3.894,302,944],
    [56,'Ba','Barium',137.33,6,'2','alkaline earth metal',5.212,1000,2170],
    [57,'La','Lanthanum',138.91,6,'','lanthanide',5.577,1193,3737],
    [58,'Ce','Cerium',140.12,6,'','lanthanide',5.539,1068,3716],
    [59,'Pr','Praseodymium',140.91,6,'','lanthanide',5.473,1208,3793],
    [60,'Nd','Neodymium',144.24,6,'','lanthanide',5.525,1297,3347],
    [61,'Pm','Promethium',145,6,'','lanthanide',5.582,1315,3273],
    [62,'Sm','Samarium',150.36,6,'','lanthanide',5.644,1345,2067],
    [63,'Eu','Europium',151.96,6,'','lanthanide',5.670,1099,1802],
    [64,'Gd','Gadolinium',157.25,6,'','lanthanide',6.150,1585,3546],
    [65,'Tb','Terbium',158.93,6,'','lanthanide',5.864,1629,3503],
    [66,'Dy','Dysprosium',162.50,6,'','lanthanide',5.939,1680,2840],
    [67,'Ho','Holmium',164.93,6,'','lanthanide',6.022,1734,2993],
    [68,'Er','Erbium',167.26,6,'','lanthanide',6.108,1802,3141],
    [69,'Tm','Thulium',168.93,6,'','lanthanide',6.184,1818,2223],
    [70,'Yb','Ytterbium',173.05,6,'','lanthanide',6.254,1097,1469],
    [71,'Lu','Lutetium',174.97,6,'3','lanthanide',5.426,1925,3675],
    [72,'Hf','Hafnium',178.49,6,'4','transition metal',6.825,2506,4876],
    [73,'Ta','Tantalum',180.95,6,'5','transition metal',7.550,3290,5731],
    [74,'W','Tungsten',183.84,6,'6','transition metal',7.864,3695,5828],
    [75,'Re','Rhenium',186.21,6,'7','transition metal',7.834,3459,5869],
    [76,'Os','Osmium',190.23,6,'8','transition metal',8.438,3306,5285],
    [77,'Ir','Iridium',192.22,6,'9','transition metal',8.967,2719,4701],
    [78,'Pt','Platinum',195.08,6,'10','transition metal',8.959,2041,4098],
    [79,'Au','Gold',196.97,6,'11','transition metal',9.226,1337,3129],
    [80,'Hg','Mercury',200.59,6,'12','transition metal',10.438,234,630],
    [81,'Tl','Thallium',204.38,6,'13','post-transition metal',6.108,577,1746],
    [82,'Pb','Lead',207.2,6,'14','post-transition metal',7.417,600,2022],
    [83,'Bi','Bismuth',208.98,6,'15','post-transition metal',7.286,544,1837],
    [84,'Po','Polonium',209,6,'16','post-transition metal',8.417,527,1235],
    [85,'At','Astatine',210,6,'17','halogen',9.32,575,610],
    [86,'Rn','Radon',222,6,'18','noble gas',10.749,202,211],
    [87,'Fr','Francium',223,7,'1','alkali metal',4.073,300,950],
    [88,'Ra','Radium',226,7,'2','alkaline earth metal',5.279,973,2010],
    [89,'Ac','Actinium',227,7,'','actinide',5.380,1323,3471],
    [90,'Th','Thorium',232.04,7,'','actinide',6.307,2115,5061],
    [91,'Pa','Protactinium',231.04,7,'','actinide',5.890,1841,4300],
    [92,'U','Uranium',238.03,7,'','actinide',6.194,1405,4404],
    [93,'Np','Neptunium',237,7,'','actinide',6.265,917,4273],
    [94,'Pu','Plutonium',244,7,'','actinide',6.026,913,3501],
    [95,'Am','Americium',243,7,'','actinide',5.974,1449,2880],
    [96,'Cm','Curium',247,7,'','actinide',5.991,1613,3383],
    [97,'Bk','Berkelium',247,7,'','actinide',6.198,1259,2900],
    [98,'Cf','Californium',251,7,'','actinide',6.282,1173,1743],
    [99,'Es','Einsteinium',252,7,'','actinide',6.42,1133,1269],
    [100,'Fm','Fermium',257,7,'','actinide',6.50,1800,null],
    [101,'Md','Mendelevium',258,7,'','actinide',6.58,1100,null],
    [102,'No','Nobelium',259,7,'','actinide',6.65,1100,null],
    [103,'Lr','Lawrencium',266,7,'3','actinide',4.96,1900,null],
    [104,'Rf','Rutherfordium',267,7,'4','transition metal',6.01,null,null],
    [105,'Db','Dubnium',268,7,'5','transition metal',null,null,null],
    [106,'Sg','Seaborgium',269,7,'6','transition metal',null,null,null],
    [107,'Bh','Bohrium',270,7,'7','transition metal',null,null,null],
    [108,'Hs','Hassium',269,7,'8','transition metal',null,null,null],
    [109,'Mt','Meitnerium',278,7,'9','transition metal',null,null,null],
    [110,'Ds','Darmstadtium',281,7,'10','transition metal',null,null,null],
    [111,'Rg','Roentgenium',282,7,'11','transition metal',null,null,null],
    [112,'Cn','Copernicium',285,7,'12','transition metal',null,null,null],
    [113,'Nh','Nihonium',286,7,'13','post-transition metal',null,null,null],
    [114,'Fl','Flerovium',289,7,'14','post-transition metal',null,null,null],
    [115,'Mc','Moscovium',290,7,'15','post-transition metal',null,null,null],
    [116,'Lv','Livermorium',293,7,'16','post-transition metal',null,null,null],
    [117,'Ts','Tennessine',294,7,'17','halogen',null,null,null],
    [118,'Og','Oganesson',294,7,'18','noble gas',null,null,null],
  ];

  const CAT_COLOR = {
    'nonmetal':'#84cc16', 'noble gas':'#a855f7', 'alkali metal':'#ef4444',
    'alkaline earth metal':'#f97316', 'metalloid':'#14b8a6', 'halogen':'#06b6d4',
    'post-transition metal':'#3b82f6', 'transition metal':'#facc15',
    'lanthanide':'#ec4899', 'actinide':'#d946ef',
  };
  function categoryColor(cat){ return CAT_COLOR[cat] || '#64748b'; }

  const byNum = {}, byName = {}, bySym = {};
  const all = [];
  for (const [num, sym, name, mass, period, group, cat, ip, mp, bp] of RAW){
    const e = { num, sym, name, mass, period, group, cat, ip, mp, bp };
    byNum[num] = e; byName[name.toLowerCase()] = e; bySym[sym] = e;
    all.push(e);
  }

  /** Accepts a name ("gold"), exact-case symbol ("Au"), atomic number ("79"),
   *  or "element 79" / "atomic number 79". */
  function lookup(input){
    if (input === undefined || input === null) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    // numeric
    let m = raw.match(/^(?:element\s+|atomic\s+number\s+)?(\d{1,3})$/i);
    if (m){ const n = parseInt(m[1], 10); return byNum[n] || null; }
    // symbol (case-sensitive)
    if (/^[A-Z][a-z]?$/.test(raw)) {
      const e = bySym[raw];
      if (e) return e;
    }
    // name (case-insensitive)
    const e = byName[raw.toLowerCase()];
    return e || null;
  }

  window.oioxoEngines.element = { lookup, all, categoryColor };
})();
