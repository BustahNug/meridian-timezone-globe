"use strict";

/* ======================= CITY DATA ======================= */

/* Embedded world-cities dataset (name, ISO2 country, admin/state code, lat, lon, population)
   — used as a fully offline fallback for the place search so it keeps working even if the
   live geocoding APIs are unreachable (e.g. sandboxed/restricted network environments).
   Source: GeoNames, via the 'all-the-cities' dataset (population >= 50,000, plus each
   country's largest city so every country has at least one match). */
var COUNTRY_NAMES = {"AF":"Afghanistan","AL":"Albania","DZ":"Algeria","AS":"American Samoa","AD":"Andorra","AO":"Angola","AI":"Anguilla","AQ":"Antarctica","AG":"Antigua and Barbuda","AR":"Argentina","AM":"Armenia","AW":"Aruba","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BH":"Bahrain","BD":"Bangladesh","BB":"Barbados","BY":"Belarus","BE":"Belgium","BZ":"Belize","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BO":"Bolivia","BA":"Bosnia and Herzegovina","BW":"Botswana","BV":"Bouvet Island","BR":"Brazil","IO":"British Indian Ocean Territory","BN":"Brunei Darussalam","BG":"Bulgaria","BF":"Burkina Faso","BI":"Burundi","KH":"Cambodia","CM":"Cameroon","CA":"Canada","CV":"Cape Verde","KY":"Cayman Islands","CF":"Central African Republic","TD":"Chad","CL":"Chile","CN":"People's Republic of China","CX":"Christmas Island","CC":"Cocos (Keeling) Islands","CO":"Colombia","KM":"Comoros","CG":"Republic of the Congo","CD":"Democratic Republic of the Congo","CK":"Cook Islands","CR":"Costa Rica","CI":"Cote d'Ivoire","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","SV":"El Salvador","GQ":"Equatorial Guinea","ER":"Eritrea","EE":"Estonia","ET":"Ethiopia","FK":"Falkland Islands (Malvinas)","FO":"Faroe Islands","FJ":"Fiji","FI":"Finland","FR":"France","GF":"French Guiana","PF":"French Polynesia","TF":"French Southern Territories","GA":"Gabon","GM":"Republic of The Gambia","GE":"Georgia","DE":"Germany","GH":"Ghana","GI":"Gibraltar","GR":"Greece","GL":"Greenland","GD":"Grenada","GP":"Guadeloupe","GU":"Guam","GT":"Guatemala","GN":"Guinea","GW":"Guinea-Bissau","GY":"Guyana","HT":"Haiti","HM":"Heard Island and McDonald Islands","VA":"Holy See (Vatican City State)","HN":"Honduras","HK":"Hong Kong","HU":"Hungary","IS":"Iceland","IN":"India","ID":"Indonesia","IR":"Islamic Republic of Iran","IQ":"Iraq","IE":"Ireland","IL":"Israel","IT":"Italy","JM":"Jamaica","JP":"Japan","JO":"Jordan","KZ":"Kazakhstan","KE":"Kenya","KI":"Kiribati","KP":"North Korea","KR":"South Korea","KW":"Kuwait","KG":"Kyrgyzstan","LA":"Lao People's Democratic Republic","LV":"Latvia","LB":"Lebanon","LS":"Lesotho","LR":"Liberia","LY":"Libya","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MO":"Macao","MG":"Madagascar","MW":"Malawi","MY":"Malaysia","MV":"Maldives","ML":"Mali","MT":"Malta","MH":"Marshall Islands","MQ":"Martinique","MR":"Mauritania","MU":"Mauritius","YT":"Mayotte","MX":"Mexico","FM":"Micronesia, Federated States of","MD":"Moldova, Republic of","MC":"Monaco","MN":"Mongolia","MS":"Montserrat","MA":"Morocco","MZ":"Mozambique","MM":"Myanmar","NA":"Namibia","NR":"Nauru","NP":"Nepal","NL":"Netherlands","NC":"New Caledonia","NZ":"New Zealand","NI":"Nicaragua","NE":"Niger","NG":"Nigeria","NU":"Niue","NF":"Norfolk Island","MK":"The Republic of North Macedonia","MP":"Northern Mariana Islands","NO":"Norway","OM":"Oman","PK":"Pakistan","PW":"Palau","PS":"State of Palestine","PA":"Panama","PG":"Papua New Guinea","PY":"Paraguay","PE":"Peru","PH":"Philippines","PN":"Pitcairn","PL":"Poland","PT":"Portugal","PR":"Puerto Rico","QA":"Qatar","RE":"Reunion","RO":"Romania","RU":"Russian Federation","RW":"Rwanda","SH":"Saint Helena","KN":"Saint Kitts and Nevis","LC":"Saint Lucia","PM":"Saint Pierre and Miquelon","VC":"Saint Vincent and the Grenadines","WS":"Samoa","SM":"San Marino","ST":"Sao Tome and Principe","SA":"Saudi Arabia","SN":"Senegal","SC":"Seychelles","SL":"Sierra Leone","SG":"Singapore","SK":"Slovakia","SI":"Slovenia","SB":"Solomon Islands","SO":"Somalia","ZA":"South Africa","GS":"South Georgia and the South Sandwich Islands","ES":"Spain","LK":"Sri Lanka","SD":"Sudan","SR":"Suriname","SJ":"Svalbard and Jan Mayen","SZ":"Eswatini","SE":"Sweden","CH":"Switzerland","SY":"Syrian Arab Republic","TW":"Taiwan, Province of China","TJ":"Tajikistan","TZ":"United Republic of Tanzania","TH":"Thailand","TL":"Timor-Leste","TG":"Togo","TK":"Tokelau","TO":"Tonga","TT":"Trinidad and Tobago","TN":"Tunisia","TR":"Türkiye","TM":"Turkmenistan","TC":"Turks and Caicos Islands","TV":"Tuvalu","UG":"Uganda","UA":"Ukraine","AE":"United Arab Emirates","GB":"United Kingdom","US":"United States of America","UM":"United States Minor Outlying Islands","UY":"Uruguay","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","VG":"Virgin Islands, British","VI":"Virgin Islands, U.S.","WF":"Wallis and Futuna","EH":"Western Sahara","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe","AX":"Åland Islands","BQ":"Bonaire, Sint Eustatius and Saba","CW":"Curaçao","GG":"Guernsey","IM":"Isle of Man","JE":"Jersey","ME":"Montenegro","BL":"Saint Barthélemy","MF":"Saint Martin (French part)","RS":"Serbia","SX":"Sint Maarten (Dutch part)","SS":"South Sudan","XK":"Kosovo"};

var CITIES = [
  {name:"Honolulu", country:"USA", lat:21.3069, lon:-157.8583, tz:"Pacific/Honolulu"},
  {name:"Anchorage", country:"USA", lat:61.2181, lon:-149.9003, tz:"America/Anchorage"},
  {name:"Los Angeles", country:"USA", lat:34.0522, lon:-118.2437, tz:"America/Los_Angeles"},
  {name:"Vancouver", country:"Canada", lat:49.2827, lon:-123.1207, tz:"America/Vancouver"},
  {name:"Denver", country:"USA", lat:39.7392, lon:-104.9903, tz:"America/Denver"},
  {name:"Mexico City", country:"Mexico", lat:19.4326, lon:-99.1332, tz:"America/Mexico_City"},
  {name:"Chicago", country:"USA", lat:41.8781, lon:-87.6298, tz:"America/Chicago"},
  {name:"New York", country:"USA", lat:40.7128, lon:-74.0060, tz:"America/New_York"},
  {name:"Toronto", country:"Canada", lat:43.6532, lon:-79.3832, tz:"America/Toronto"},
  {name:"Lima", country:"Peru", lat:-12.0464, lon:-77.0428, tz:"America/Lima"},
  {name:"Santiago", country:"Chile", lat:-33.4489, lon:-70.6693, tz:"America/Santiago"},
  {name:"Buenos Aires", country:"Argentina", lat:-34.6037, lon:-58.3816, tz:"America/Argentina/Buenos_Aires"},
  {name:"São Paulo", country:"Brazil", lat:-23.5505, lon:-46.6333, tz:"America/Sao_Paulo"},
  {name:"Reykjavik", country:"Iceland", lat:64.1466, lon:-21.9426, tz:"Atlantic/Reykjavik"},
  {name:"London", country:"UK", lat:51.5074, lon:-0.1278, tz:"Europe/London"},
  {name:"Lisbon", country:"Portugal", lat:38.7223, lon:-9.1393, tz:"Europe/Lisbon"},
  {name:"Paris", country:"France", lat:48.8566, lon:2.3522, tz:"Europe/Paris"},
  {name:"Berlin", country:"Germany", lat:52.5200, lon:13.4050, tz:"Europe/Berlin"},
  {name:"Cairo", country:"Egypt", lat:30.0444, lon:31.2357, tz:"Africa/Cairo"},
  {name:"Johannesburg", country:"South Africa", lat:-26.2041, lon:28.0473, tz:"Africa/Johannesburg"},
  {name:"Athens", country:"Greece", lat:37.9838, lon:23.7275, tz:"Europe/Athens"},
  {name:"Moscow", country:"Russia", lat:55.7558, lon:37.6173, tz:"Europe/Moscow"},
  {name:"Nairobi", country:"Kenya", lat:-1.2921, lon:36.8219, tz:"Africa/Nairobi"},
  {name:"Dubai", country:"UAE", lat:25.2048, lon:55.2708, tz:"Asia/Dubai"},
  {name:"Tehran", country:"Iran", lat:35.6892, lon:51.3890, tz:"Asia/Tehran"},
  {name:"Karachi", country:"Pakistan", lat:24.8607, lon:67.0011, tz:"Asia/Karachi"},
  {name:"Mumbai", country:"India", lat:19.0760, lon:72.8777, tz:"Asia/Kolkata"},
  {name:"Delhi", country:"India", lat:28.6139, lon:77.2090, tz:"Asia/Kolkata"},
  {name:"Dhaka", country:"Bangladesh", lat:23.8103, lon:90.4125, tz:"Asia/Dhaka"},
  {name:"Bangkok", country:"Thailand", lat:13.7563, lon:100.5018, tz:"Asia/Bangkok"},
  {name:"Jakarta", country:"Indonesia", lat:-6.2088, lon:106.8456, tz:"Asia/Jakarta"},
  {name:"Singapore", country:"Singapore", lat:1.3521, lon:103.8198, tz:"Asia/Singapore"},
  {name:"Hong Kong", country:"China", lat:22.3193, lon:114.1694, tz:"Asia/Hong_Kong"},
  {name:"Beijing", country:"China", lat:39.9042, lon:116.4074, tz:"Asia/Shanghai"},
  {name:"Perth", country:"Australia", lat:-31.9505, lon:115.8605, tz:"Australia/Perth"},
  {name:"Seoul", country:"South Korea", lat:37.5665, lon:126.9780, tz:"Asia/Seoul"},
  {name:"Tokyo", country:"Japan", lat:35.6762, lon:139.6503, tz:"Asia/Tokyo"},
  {name:"Sydney", country:"Australia", lat:-33.8688, lon:151.2093, tz:"Australia/Sydney"},
  {name:"Auckland", country:"New Zealand", lat:-36.8485, lon:174.7633, tz:"Pacific/Auckland"},
  {name:"Fiji", country:"Fiji", lat:-18.1416, lon:178.4419, tz:"Pacific/Fiji"}
];

/* try to find the visitor's own timezone in the list, else synthesize an entry */
var LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
var LOCAL_CITY = CITIES.find(c => c.tz === LOCAL_TZ);
if(!LOCAL_CITY){
  LOCAL_CITY = {name:"Your location", country:LOCAL_TZ, lat:0, lon:0, tz:LOCAL_TZ, synthetic:true};
}

/* ======================= COUNTRY / CONTINENT / TIMEZONE TABLES ======================= */
var COUNTRY_INFO = {
  "Afghanistan":{c:"Asia", tz:"Asia/Kabul"}, "Albania":{c:"Europe", tz:"Europe/Tirane"},
  "Algeria":{c:"Africa", tz:"Africa/Algiers"}, "Angola":{c:"Africa", tz:"Africa/Luanda"},
  "Antarctica":{c:"Antarctica", tz:"Antarctica/McMurdo"}, "Argentina":{c:"South America", tz:"America/Argentina/Buenos_Aires"},
  "Armenia":{c:"Asia", tz:"Asia/Yerevan"}, "Australia":{c:"Oceania", tz:"MULTI"},
  "Austria":{c:"Europe", tz:"Europe/Vienna"}, "Azerbaijan":{c:"Asia", tz:"Asia/Baku"},
  "Bahamas":{c:"North America", tz:"America/Nassau"}, "Bangladesh":{c:"Asia", tz:"Asia/Dhaka"},
  "Belarus":{c:"Europe", tz:"Europe/Minsk"}, "Belgium":{c:"Europe", tz:"Europe/Brussels"},
  "Belize":{c:"North America", tz:"America/Belize"}, "Benin":{c:"Africa", tz:"Africa/Porto-Novo"},
  "Bhutan":{c:"Asia", tz:"Asia/Thimphu"}, "Bolivia":{c:"South America", tz:"America/La_Paz"},
  "Bosnia and Herz.":{c:"Europe", tz:"Europe/Sarajevo"}, "Botswana":{c:"Africa", tz:"Africa/Gaborone"},
  "Brazil":{c:"South America", tz:"MULTI"}, "Brunei":{c:"Asia", tz:"Asia/Brunei"},
  "Bulgaria":{c:"Europe", tz:"Europe/Sofia"}, "Burkina Faso":{c:"Africa", tz:"Africa/Ouagadougou"},
  "Burundi":{c:"Africa", tz:"Africa/Bujumbura"}, "Cambodia":{c:"Asia", tz:"Asia/Phnom_Penh"},
  "Cameroon":{c:"Africa", tz:"Africa/Douala"}, "Canada":{c:"North America", tz:"MULTI"},
  "Central African Rep.":{c:"Africa", tz:"Africa/Bangui"}, "Chad":{c:"Africa", tz:"Africa/Ndjamena"},
  "Chile":{c:"South America", tz:"America/Santiago"}, "China":{c:"Asia", tz:"Asia/Shanghai"},
  "Colombia":{c:"South America", tz:"America/Bogota"}, "Congo":{c:"Africa", tz:"Africa/Brazzaville"},
  "Costa Rica":{c:"North America", tz:"America/Costa_Rica"}, "Croatia":{c:"Europe", tz:"Europe/Zagreb"},
  "Cuba":{c:"North America", tz:"America/Havana"}, "Cyprus":{c:"Asia", tz:"Asia/Nicosia"},
  "Czechia":{c:"Europe", tz:"Europe/Prague"}, "Côte d'Ivoire":{c:"Africa", tz:"Africa/Abidjan"},
  "Dem. Rep. Congo":{c:"Africa", tz:"Africa/Kinshasa"}, "Denmark":{c:"Europe", tz:"Europe/Copenhagen"},
  "Djibouti":{c:"Africa", tz:"Africa/Djibouti"}, "Dominican Rep.":{c:"North America", tz:"America/Santo_Domingo"},
  "Ecuador":{c:"South America", tz:"America/Guayaquil"}, "Egypt":{c:"Africa", tz:"Africa/Cairo"},
  "El Salvador":{c:"North America", tz:"America/El_Salvador"}, "Eq. Guinea":{c:"Africa", tz:"Africa/Malabo"},
  "Eritrea":{c:"Africa", tz:"Africa/Asmara"}, "Estonia":{c:"Europe", tz:"Europe/Tallinn"},
  "Ethiopia":{c:"Africa", tz:"Africa/Addis_Ababa"}, "Falkland Is.":{c:"South America", tz:"Atlantic/Stanley"},
  "Fiji":{c:"Oceania", tz:"Pacific/Fiji"}, "Finland":{c:"Europe", tz:"Europe/Helsinki"},
  "Fr. S. Antarctic Lands":{c:"Antarctica", tz:"Indian/Kerguelen"}, "France":{c:"Europe", tz:"Europe/Paris"},
  "Gabon":{c:"Africa", tz:"Africa/Libreville"}, "Gambia":{c:"Africa", tz:"Africa/Banjul"},
  "Georgia":{c:"Asia", tz:"Asia/Tbilisi"}, "Germany":{c:"Europe", tz:"Europe/Berlin"},
  "Ghana":{c:"Africa", tz:"Africa/Accra"}, "Greece":{c:"Europe", tz:"Europe/Athens"},
  "Greenland":{c:"North America", tz:"America/Nuuk"}, "Guatemala":{c:"North America", tz:"America/Guatemala"},
  "Guinea":{c:"Africa", tz:"Africa/Conakry"}, "Guinea-Bissau":{c:"Africa", tz:"Africa/Bissau"},
  "Guyana":{c:"South America", tz:"America/Guyana"}, "Haiti":{c:"North America", tz:"America/Port-au-Prince"},
  "Honduras":{c:"North America", tz:"America/Tegucigalpa"}, "Hungary":{c:"Europe", tz:"Europe/Budapest"},
  "Iceland":{c:"Europe", tz:"Atlantic/Reykjavik"}, "India":{c:"Asia", tz:"Asia/Kolkata"},
  "Indonesia":{c:"Asia", tz:"MULTI"}, "Iran":{c:"Asia", tz:"Asia/Tehran"},
  "Iraq":{c:"Asia", tz:"Asia/Baghdad"}, "Ireland":{c:"Europe", tz:"Europe/Dublin"},
  "Israel":{c:"Asia", tz:"Asia/Jerusalem"}, "Italy":{c:"Europe", tz:"Europe/Rome"},
  "Jamaica":{c:"North America", tz:"America/Jamaica"}, "Japan":{c:"Asia", tz:"Asia/Tokyo"},
  "Jordan":{c:"Asia", tz:"Asia/Amman"}, "Kazakhstan":{c:"Asia", tz:"MULTI"},
  "Kenya":{c:"Africa", tz:"Africa/Nairobi"}, "Kosovo":{c:"Europe", tz:"Europe/Belgrade"},
  "Kuwait":{c:"Asia", tz:"Asia/Kuwait"}, "Kyrgyzstan":{c:"Asia", tz:"Asia/Bishkek"},
  "Laos":{c:"Asia", tz:"Asia/Vientiane"}, "Latvia":{c:"Europe", tz:"Europe/Riga"},
  "Lebanon":{c:"Asia", tz:"Asia/Beirut"}, "Lesotho":{c:"Africa", tz:"Africa/Maseru"},
  "Liberia":{c:"Africa", tz:"Africa/Monrovia"}, "Libya":{c:"Africa", tz:"Africa/Tripoli"},
  "Lithuania":{c:"Europe", tz:"Europe/Vilnius"}, "Luxembourg":{c:"Europe", tz:"Europe/Luxembourg"},
  "Macedonia":{c:"Europe", tz:"Europe/Skopje"}, "Madagascar":{c:"Africa", tz:"Indian/Antananarivo"},
  "Malawi":{c:"Africa", tz:"Africa/Blantyre"}, "Malaysia":{c:"Asia", tz:"Asia/Kuala_Lumpur"},
  "Mali":{c:"Africa", tz:"Africa/Bamako"}, "Mauritania":{c:"Africa", tz:"Africa/Nouakchott"},
  "Mexico":{c:"North America", tz:"MULTI"}, "Moldova":{c:"Europe", tz:"Europe/Chisinau"},
  "Mongolia":{c:"Asia", tz:"Asia/Ulaanbaatar"}, "Montenegro":{c:"Europe", tz:"Europe/Podgorica"},
  "Morocco":{c:"Africa", tz:"Africa/Casablanca"}, "Mozambique":{c:"Africa", tz:"Africa/Maputo"},
  "Myanmar":{c:"Asia", tz:"Asia/Yangon"}, "N. Cyprus":{c:"Asia", tz:"Europe/Istanbul"},
  "Namibia":{c:"Africa", tz:"Africa/Windhoek"}, "Nepal":{c:"Asia", tz:"Asia/Kathmandu"},
  "Netherlands":{c:"Europe", tz:"Europe/Amsterdam"}, "New Caledonia":{c:"Oceania", tz:"Pacific/Noumea"},
  "New Zealand":{c:"Oceania", tz:"Pacific/Auckland"}, "Nicaragua":{c:"North America", tz:"America/Managua"},
  "Niger":{c:"Africa", tz:"Africa/Niamey"}, "Nigeria":{c:"Africa", tz:"Africa/Lagos"},
  "North Korea":{c:"Asia", tz:"Asia/Pyongyang"}, "Norway":{c:"Europe", tz:"Europe/Oslo"},
  "Oman":{c:"Asia", tz:"Asia/Muscat"}, "Pakistan":{c:"Asia", tz:"Asia/Karachi"},
  "Palestine":{c:"Asia", tz:"Asia/Gaza"}, "Panama":{c:"North America", tz:"America/Panama"},
  "Papua New Guinea":{c:"Oceania", tz:"Pacific/Port_Moresby"}, "Paraguay":{c:"South America", tz:"America/Asuncion"},
  "Peru":{c:"South America", tz:"America/Lima"}, "Philippines":{c:"Asia", tz:"Asia/Manila"},
  "Poland":{c:"Europe", tz:"Europe/Warsaw"}, "Portugal":{c:"Europe", tz:"Europe/Lisbon"},
  "Puerto Rico":{c:"North America", tz:"America/Puerto_Rico"}, "Qatar":{c:"Asia", tz:"Asia/Qatar"},
  "Romania":{c:"Europe", tz:"Europe/Bucharest"}, "Russia":{c:"Europe", tz:"MULTI"},
  "Rwanda":{c:"Africa", tz:"Africa/Kigali"}, "S. Sudan":{c:"Africa", tz:"Africa/Juba"},
  "Saudi Arabia":{c:"Asia", tz:"Asia/Riyadh"}, "Senegal":{c:"Africa", tz:"Africa/Dakar"},
  "Serbia":{c:"Europe", tz:"Europe/Belgrade"}, "Sierra Leone":{c:"Africa", tz:"Africa/Freetown"},
  "Slovakia":{c:"Europe", tz:"Europe/Bratislava"}, "Slovenia":{c:"Europe", tz:"Europe/Ljubljana"},
  "Solomon Is.":{c:"Oceania", tz:"Pacific/Guadalcanal"}, "Somalia":{c:"Africa", tz:"Africa/Mogadishu"},
  "Somaliland":{c:"Africa", tz:"Africa/Hargeisa"}, "South Africa":{c:"Africa", tz:"Africa/Johannesburg"},
  "South Korea":{c:"Asia", tz:"Asia/Seoul"}, "Spain":{c:"Europe", tz:"Europe/Madrid"},
  "Sri Lanka":{c:"Asia", tz:"Asia/Colombo"}, "Sudan":{c:"Africa", tz:"Africa/Khartoum"},
  "Suriname":{c:"South America", tz:"America/Paramaribo"}, "Sweden":{c:"Europe", tz:"Europe/Stockholm"},
  "Switzerland":{c:"Europe", tz:"Europe/Zurich"}, "Syria":{c:"Asia", tz:"Asia/Damascus"},
  "Taiwan":{c:"Asia", tz:"Asia/Taipei"}, "Tajikistan":{c:"Asia", tz:"Asia/Dushanbe"},
  "Tanzania":{c:"Africa", tz:"Africa/Dar_es_Salaam"}, "Thailand":{c:"Asia", tz:"Asia/Bangkok"},
  "Timor-Leste":{c:"Asia", tz:"Asia/Dili"}, "Togo":{c:"Africa", tz:"Africa/Lome"},
  "Trinidad and Tobago":{c:"North America", tz:"America/Port_of_Spain"}, "Tunisia":{c:"Africa", tz:"Africa/Tunis"},
  "Turkey":{c:"Asia", tz:"Europe/Istanbul"}, "Turkmenistan":{c:"Asia", tz:"Asia/Ashgabat"},
  "Uganda":{c:"Africa", tz:"Africa/Kampala"}, "Ukraine":{c:"Europe", tz:"Europe/Kyiv"},
  "United Arab Emirates":{c:"Asia", tz:"Asia/Dubai"}, "United Kingdom":{c:"Europe", tz:"Europe/London"},
  "United States of America":{c:"North America", tz:"MULTI"}, "Uruguay":{c:"South America", tz:"America/Montevideo"},
  "Uzbekistan":{c:"Asia", tz:"Asia/Tashkent"}, "Vanuatu":{c:"Oceania", tz:"Pacific/Efate"},
  "Venezuela":{c:"South America", tz:"America/Caracas"}, "Vietnam":{c:"Asia", tz:"Asia/Ho_Chi_Minh"},
  "W. Sahara":{c:"Africa", tz:"Africa/El_Aaiun"}, "Yemen":{c:"Asia", tz:"Asia/Aden"},
  "Zambia":{c:"Africa", tz:"Africa/Lusaka"}, "Zimbabwe":{c:"Africa", tz:"Africa/Harare"},
  "eSwatini":{c:"Africa", tz:"Africa/Mbabane"}
};

var CONTINENT_COLORS = {
  "Africa":"#c4783f", "Asia":"#9c8a3a", "Europe":"#5f7a9c", "North America":"#7a5f9c",
  "South America":"#3f9c6b", "Oceania":"#3f8a9c", "Antarctica":"#c7cfe0"
};
var OCEAN_COLOR = "#0c1226";

var DISPLAY_NAME = {
  "United States of America":"USA", "United Kingdom":"UK", "United Arab Emirates":"UAE",
  "Dominican Rep.":"Dominican Rep.", "Bosnia and Herz.":"Bosnia & Herz.",
  "Central African Rep.":"C.A.R.", "Dem. Rep. Congo":"D.R. Congo", "Eq. Guinea":"Eq. Guinea"
};

var OCEAN_LABELS = [
  {name:"PACIFIC OCEAN", lat:2, lon:-155, size:30},
  {name:"PACIFIC OCEAN", lat:-18, lon:172, size:22},
  {name:"ATLANTIC OCEAN", lat:6, lon:-38, size:26},
  {name:"INDIAN OCEAN", lat:-26, lon:76, size:24},
  {name:"SOUTHERN OCEAN", lat:-64, lon:15, size:18},
  {name:"ARCTIC OCEAN", lat:81, lon:5, size:18}
];

/* Canadian provinces/cities — no province-boundary dataset is loaded, so these are placed as
   point labels (fixed lat/lon) rather than polygon-centroid labels, but they use the same
   zoom-tier visibility/sizing and hover behavior as the US state labels */
var EXTRA_LABELS = [
  {name:"British Columbia", lat:54.5, lon:-125.5, tz:"America/Vancouver", kind:"province", weight:0.62},
  {name:"Ontario", lat:50.0, lon:-85.5, tz:"America/Toronto", kind:"province", weight:0.62},
  {name:"Newfoundland", lat:48.9, lon:-56.0, tz:"America/St_Johns", kind:"province", weight:0.55},
  {name:"Vancouver", lat:49.2827, lon:-123.1207, tz:"America/Vancouver", kind:"city", weight:0.4},
  {name:"Toronto", lat:43.6532, lon:-79.3832, tz:"America/Toronto", kind:"city", weight:0.4}
];

var US_STATE_TZ = {
  "Alabama":"America/Chicago","Alaska":"America/Anchorage","American Samoa":"Pacific/Pago_Pago",
  "Arizona":"America/Phoenix","Arkansas":"America/Chicago","California":"America/Los_Angeles",
  "Colorado":"America/Denver","Commonwealth of the Northern Mariana Islands":"Pacific/Saipan",
  "Connecticut":"America/New_York","Delaware":"America/New_York","District of Columbia":"America/New_York",
  "Florida":"America/New_York","Georgia":"America/New_York","Guam":"Pacific/Guam","Hawaii":"Pacific/Honolulu",
  "Idaho":"America/Boise","Illinois":"America/Chicago","Indiana":"America/Indiana/Indianapolis",
  "Iowa":"America/Chicago","Kansas":"America/Chicago","Kentucky":"America/New_York","Louisiana":"America/Chicago",
  "Maine":"America/New_York","Maryland":"America/New_York","Massachusetts":"America/New_York",
  "Michigan":"America/Detroit","Minnesota":"America/Chicago","Mississippi":"America/Chicago",
  "Missouri":"America/Chicago","Montana":"America/Denver","Nebraska":"America/Chicago","Nevada":"America/Los_Angeles",
  "New Hampshire":"America/New_York","New Jersey":"America/New_York","New Mexico":"America/Denver",
  "New York":"America/New_York","North Carolina":"America/New_York","North Dakota":"America/Chicago",
  "Ohio":"America/New_York","Oklahoma":"America/Chicago","Oregon":"America/Los_Angeles",
  "Pennsylvania":"America/New_York","Puerto Rico":"America/Puerto_Rico","Rhode Island":"America/New_York",
  "South Carolina":"America/New_York","South Dakota":"America/Chicago","Tennessee":"America/Chicago",
  "Texas":"America/Chicago","United States Virgin Islands":"America/St_Thomas","Utah":"America/Denver",
  "Vermont":"America/New_York","Virginia":"America/New_York","Washington":"America/Los_Angeles",
  "West Virginia":"America/New_York","Wisconsin":"America/Chicago","Wyoming":"America/Denver"
};

function bandLookup(bands, value){
  for(const b of bands){ if(value < b.lt) return b.tz; }
  return bands[bands.length-1].tz;
}
var CANADA_TZ_BANDS = [
  {lt:-120,tz:"America/Vancouver"},{lt:-102,tz:"America/Edmonton"},{lt:-90,tz:"America/Winnipeg"},
  {lt:-68,tz:"America/Toronto"},{lt:-60,tz:"America/Halifax"},{lt:181,tz:"America/St_Johns"}
];
var MULTI_ZONE_RESOLVERS = {
  "Russia": (lat,lon)=>bandLookup([
    {lt:40,tz:"Europe/Kaliningrad"},{lt:50,tz:"Europe/Moscow"},{lt:60,tz:"Europe/Samara"},
    {lt:70,tz:"Asia/Yekaterinburg"},{lt:90,tz:"Asia/Omsk"},{lt:105,tz:"Asia/Krasnoyarsk"},
    {lt:120,tz:"Asia/Irkutsk"},{lt:137,tz:"Asia/Yakutsk"},{lt:160,tz:"Asia/Vladivostok"},
    {lt:170,tz:"Asia/Magadan"},{lt:181,tz:"Asia/Kamchatka"}
  ], lon),
  "Canada": (lat,lon)=>bandLookup(CANADA_TZ_BANDS, lon),
  "Australia": (lat,lon)=>{
    if(lon < 129) return "Australia/Perth";
    if(lon < 141) return lat > -26 ? "Australia/Darwin" : "Australia/Adelaide";
    return (lat > -29) ? "Australia/Brisbane" : "Australia/Sydney";
  },
  "Brazil": (lat,lon)=>bandLookup([
    {lt:-68,tz:"America/Rio_Branco"},{lt:-60,tz:"America/Manaus"},{lt:181,tz:"America/Sao_Paulo"}
  ], lon),
  "Mexico": (lat,lon)=>bandLookup([
    {lt:-115,tz:"America/Tijuana"},{lt:-105,tz:"America/Mazatlan"},{lt:-90,tz:"America/Mexico_City"},{lt:181,tz:"America/Cancun"}
  ], lon),
  "Indonesia": (lat,lon)=>bandLookup([
    {lt:109,tz:"Asia/Jakarta"},{lt:125,tz:"Asia/Makassar"},{lt:181,tz:"Asia/Jayapura"}
  ], lon),
  "Kazakhstan": (lat,lon)=>lon < 68 ? "Asia/Aqtobe" : "Asia/Almaty",
  "United States of America": (lat,lon)=>{
    const st = findUSState(lat,lon);
    return st ? (US_STATE_TZ[st]||"America/New_York") : "America/New_York";
  }
};

/* Per-country longitude-band zone arrays used for texture coloring. Each entry drives a
   vertical clip rect that's filled with the color for that timezone, so the country polygon
   is painted in distinct bands rather than a single centroid color. */
var MULTI_ZONE_BANDS = {
  "Russia": [
    {lt:40,tz:"Europe/Kaliningrad"},{lt:50,tz:"Europe/Moscow"},{lt:60,tz:"Europe/Samara"},
    {lt:70,tz:"Asia/Yekaterinburg"},{lt:90,tz:"Asia/Omsk"},{lt:105,tz:"Asia/Krasnoyarsk"},
    {lt:120,tz:"Asia/Irkutsk"},{lt:137,tz:"Asia/Yakutsk"},{lt:160,tz:"Asia/Vladivostok"},
    {lt:170,tz:"Asia/Magadan"},{lt:181,tz:"Asia/Kamchatka"}
  ],
  "Brazil": [
    {lt:-68,tz:"America/Rio_Branco"},{lt:-60,tz:"America/Manaus"},{lt:181,tz:"America/Sao_Paulo"}
  ],
  "Mexico": [
    {lt:-115,tz:"America/Tijuana"},{lt:-105,tz:"America/Mazatlan"},
    {lt:-90,tz:"America/Mexico_City"},{lt:181,tz:"America/Cancun"}
  ],
  "Indonesia": [
    {lt:109,tz:"Asia/Jakarta"},{lt:125,tz:"Asia/Makassar"},{lt:181,tz:"Asia/Jayapura"}
  ],
  "Kazakhstan": [
    {lt:68,tz:"Asia/Aqtobe"},{lt:181,tz:"Asia/Almaty"}
  ]
};

/* Australia needs both latitude and longitude splits (Darwin vs Adelaide share the same
   longitude band but differ by latitude; Brisbane vs Sydney likewise). Each rect entry
   is a lon/lat bounding box mapped to a specific IANA timezone. */
var AUSTRALIA_ZONE_RECTS = [
  {lonMin:-180, lonMax:129,  latMin:-90, latMax:90,  tz:"Australia/Perth"},
  {lonMin:129,  lonMax:141,  latMin:-26, latMax:90,  tz:"Australia/Darwin"},
  {lonMin:129,  lonMax:141,  latMin:-90, latMax:-26, tz:"Australia/Adelaide"},
  {lonMin:141,  lonMax:181,  latMin:-29, latMax:90,  tz:"Australia/Brisbane"},
  {lonMin:141,  lonMax:181,  latMin:-90, latMax:-29, tz:"Australia/Sydney"},
];

/* ======================= GEO DATA (countries + US states) ======================= */
var countryFeatures = null;   // [{name, geometry}]
var usStateFeatures = null;   // [{name, geometry}]
var geoReady = false;

function pointInRing(pt, ring){
  let inside = false;
  for(let i=0, j=ring.length-1; i<ring.length; j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    const intersect = ((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi);
    if(intersect) inside = !inside;
  }
  return inside;
}
function pointInGeom(pt, geometry){
  if(!geometry) return false;
  if(geometry.type==='Polygon') return geometry.coordinates.some(ring=>pointInRing(pt, ring));
  if(geometry.type==='MultiPolygon') return geometry.coordinates.some(poly=>poly.some(ring=>pointInRing(pt, ring)));
  return false;
}
function findCountry(lat, lon){
  if(!countryFeatures) return null;
  const pt = [lon, lat];
  for(const f of countryFeatures){ if(pointInGeom(pt, f.geometry)) return f.name; }
  return null;
}
function findUSState(lat, lon){
  if(!usStateFeatures) return null;
  const pt = [lon, lat];
  for(const f of usStateFeatures){ if(pointInGeom(pt, f.geometry)) return f.name; }
  return null;
}
function resolveTimezoneForLatLon(lat, lon){
  const country = findCountry(lat, lon);
  if(!country){
    // offline fallback: crude longitude-based estimate when geo data isn't loaded
    const off = Math.round(lon/15);
    return {country:null, tz: off===0 ? 'UTC' : `Etc/GMT${off>0?'-':'+'}${Math.abs(off)}`, approx:true};
  }
  const info = COUNTRY_INFO[country];
  if(!info) return {country, tz:'UTC', approx:true};
  if(info.tz === 'MULTI'){
    const resolver = MULTI_ZONE_RESOLVERS[country];
    const tz = resolver ? resolver(lat,lon) : 'UTC';
    return {country, tz, approx:false};
  }
  return {country, tz:info.tz, approx:false};
}

// some states use a distinct IANA id for historical reasons even though they currently
// keep identical clocks to a neighboring zone — group those so the boundary mesh only
// draws a line where the actual time genuinely differs
var ZONE_ALIASES = {
  "America/Boise": "America/Denver",                    // Mountain w/ DST, same as Denver
  "America/Indiana/Indianapolis": "America/New_York",    // Eastern w/ DST, same as New York
  "America/Detroit": "America/New_York"                  // Eastern w/ DST, same as New York
};
function zoneGroup(tz){ return ZONE_ALIASES[tz] || tz; }
/* January 1st is always standard time in the Northern Hemisphere, so comparing a zone's
   current offset against its January offset reliably tells us whether DST is in effect. */
function isMountainDSTActive(now){
  const std = getOffsetMinutes(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), "America/Denver");
  const cur = getOffsetMinutes(now, "America/Denver");
  return cur !== std;
}

async function loadGeoData(){
  try{
    const [worldTopo, usTopo] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r=>r.json()),
      fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json').then(r=>r.json())
    ]);
    const worldFC = topojson.feature(worldTopo, worldTopo.objects.countries);
    countryFeatures = worldFC.features.map(f=>({name:f.properties.name, geometry:f.geometry}));
    const usFC = topojson.feature(usTopo, usTopo.objects.states);
    usStateFeatures = usFC.features.map(f=>({name:f.properties.name, geometry:f.geometry}));

    const countryMesh = topojson.mesh(worldTopo, worldTopo.objects.countries, (a,b)=>a!==b);
    const usMesh = topojson.mesh(usTopo, usTopo.objects.states, (a,b)=>a!==b);

    geoReady = true;
    drawStaticMap(countryFeatures, countryMesh, usStateFeatures, usMesh);
    redrawTexture();
    const ln = document.getElementById('loadingNote');
    if(ln) ln.classList.add('hide');
  }catch(e){
    geoReady = false;
    const ln = document.getElementById('loadingNote');
    if(ln) ln.textContent = 'map data unavailable — showing simplified globe';
  }
}
