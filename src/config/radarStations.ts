/**
 * radarStations.ts — static list of every CONUS NEXRAD WSR-88D radar site.
 *
 * Source: NOAA / NWS public station catalog. Coordinates are the radar's
 * physical location (not the city center). Used by `findNearestStation` in
 * src/lib/nearestStation.ts to pick the best site for any given lat/lon.
 *
 * Adding a station: just append a new object — no other code changes needed.
 */

export interface RadarStation {
  id: string;   // 4-letter NEXRAD identifier, e.g. "KTLX"
  name: string; // Human-readable label shown in the UI
  lat: number;
  lon: number;
}

export const RADAR_STATIONS: RadarStation[] = [
  // Alabama
  { id: "KBMX", name: "Birmingham, AL", lat: 33.172, lon: -86.770 },
  { id: "KEOX", name: "Fort Rucker, AL", lat: 31.460, lon: -85.459 },
  { id: "KHTX", name: "Huntsville, AL", lat: 34.931, lon: -86.084 },
  { id: "KMXX", name: "Maxwell AFB, AL", lat: 32.537, lon: -85.790 },
  { id: "KMOB", name: "Mobile, AL", lat: 30.679, lon: -88.240 },

  // Arkansas
  { id: "KSRX", name: "Fort Smith, AR", lat: 35.290, lon: -94.362 },
  { id: "KLZK", name: "Little Rock, AR", lat: 34.836, lon: -92.262 },

  // Arizona
  { id: "KFSX", name: "Flagstaff, AZ", lat: 34.574, lon: -111.198 },
  { id: "KIWA", name: "Phoenix, AZ", lat: 33.289, lon: -111.670 },
  { id: "KEMX", name: "Tucson, AZ", lat: 31.894, lon: -110.630 },
  { id: "KYUX", name: "Yuma, AZ", lat: 32.495, lon: -114.657 },

  // California
  { id: "KBBX", name: "Beale AFB, CA", lat: 39.496, lon: -121.632 },
  { id: "KEYX", name: "Edwards AFB, CA", lat: 35.098, lon: -117.561 },
  { id: "KBHX", name: "Eureka, CA", lat: 40.499, lon: -124.292 },
  { id: "KHNX", name: "Hanford, CA", lat: 36.314, lon: -119.632 },
  { id: "KVTX", name: "Los Angeles, CA", lat: 34.412, lon: -119.179 },
  { id: "KDAX", name: "Sacramento, CA", lat: 38.501, lon: -121.678 },
  { id: "KNKX", name: "San Diego, CA", lat: 32.919, lon: -117.042 },
  { id: "KMUX", name: "San Francisco, CA", lat: 37.155, lon: -121.898 },
  { id: "KSOX", name: "Santa Ana Mtns, CA", lat: 33.818, lon: -117.636 },
  { id: "KVBX", name: "Vandenberg AFB, CA", lat: 34.838, lon: -120.398 },

  // Colorado
  { id: "KFTG", name: "Denver, CO", lat: 39.787, lon: -104.546 },
  { id: "KGJX", name: "Grand Junction, CO", lat: 39.062, lon: -108.214 },
  { id: "KPUX", name: "Pueblo, CO", lat: 38.460, lon: -104.181 },

  // Connecticut / Mass / RI
  { id: "KBOX", name: "Boston, MA", lat: 41.956, lon: -71.137 },

  // DC / Mid-Atlantic
  { id: "KLWX", name: "Sterling, VA (DC)", lat: 38.976, lon: -77.478 },

  // Delaware
  { id: "KDOX", name: "Dover AFB, DE", lat: 38.826, lon: -75.440 },

  // Florida
  { id: "KEVX", name: "Eglin AFB, FL", lat: 30.564, lon: -85.921 },
  { id: "KJAX", name: "Jacksonville, FL", lat: 30.485, lon: -81.702 },
  { id: "KBYX", name: "Key West, FL", lat: 24.597, lon: -81.703 },
  { id: "KMLB", name: "Melbourne, FL", lat: 28.113, lon: -80.654 },
  { id: "KAMX", name: "Miami, FL", lat: 25.611, lon: -80.413 },
  { id: "KTLH", name: "Tallahassee, FL", lat: 30.398, lon: -84.329 },
  { id: "KTBW", name: "Tampa Bay, FL", lat: 27.706, lon: -82.402 },

  // Georgia
  { id: "KFFC", name: "Atlanta, GA", lat: 33.364, lon: -84.566 },
  { id: "KVAX", name: "Moody AFB, GA", lat: 30.890, lon: -83.002 },
  { id: "KJGX", name: "Robins AFB, GA", lat: 32.675, lon: -83.351 },

  // Iowa
  { id: "KDMX", name: "Des Moines, IA", lat: 41.731, lon: -93.723 },
  { id: "KDVN", name: "Davenport, IA", lat: 41.612, lon: -90.581 },

  // Idaho
  { id: "KCBX", name: "Boise, ID", lat: 43.490, lon: -116.236 },
  { id: "KSFX", name: "Pocatello, ID", lat: 43.106, lon: -112.686 },

  // Illinois
  { id: "KLOT", name: "Chicago, IL", lat: 41.604, lon: -88.085 },
  { id: "KILX", name: "Lincoln, IL", lat: 40.150, lon: -89.337 },

  // Indiana
  { id: "KVWX", name: "Evansville, IN", lat: 38.260, lon: -87.725 },
  { id: "KIND", name: "Indianapolis, IN", lat: 39.708, lon: -86.280 },
  { id: "KIWX", name: "North Webster, IN", lat: 41.359, lon: -85.700 },

  // Kansas
  { id: "KDDC", name: "Dodge City, KS", lat: 37.761, lon: -99.969 },
  { id: "KGLD", name: "Goodland, KS", lat: 39.367, lon: -101.700 },
  { id: "KTWX", name: "Topeka, KS", lat: 38.997, lon: -96.232 },
  { id: "KICT", name: "Wichita, KS", lat: 37.654, lon: -97.443 },

  // Kentucky
  { id: "KJKL", name: "Jackson, KY", lat: 37.591, lon: -83.313 },
  { id: "KLVX", name: "Louisville, KY", lat: 37.975, lon: -85.944 },
  { id: "KPAH", name: "Paducah, KY", lat: 37.068, lon: -88.772 },
  { id: "KHPX", name: "Fort Campbell, KY", lat: 36.737, lon: -87.285 },

  // Louisiana
  { id: "KPOE", name: "Fort Polk, LA", lat: 31.156, lon: -92.976 },
  { id: "KLCH", name: "Lake Charles, LA", lat: 30.125, lon: -93.216 },
  { id: "KLIX", name: "New Orleans, LA", lat: 30.337, lon: -89.825 },
  { id: "KSHV", name: "Shreveport, LA", lat: 32.451, lon: -93.841 },

  // Maine
  { id: "KCBW", name: "Caribou, ME", lat: 46.039, lon: -67.806 },
  { id: "KGYX", name: "Portland, ME", lat: 43.891, lon: -70.257 },

  // Maryland (covered by KLWX)

  // Michigan
  { id: "KAPX", name: "Gaylord, MI", lat: 44.907, lon: -84.720 },
  { id: "KGRR", name: "Grand Rapids, MI", lat: 42.894, lon: -85.545 },
  { id: "KDTX", name: "Detroit, MI", lat: 42.700, lon: -83.472 },
  { id: "KMQT", name: "Marquette, MI", lat: 46.531, lon: -87.548 },

  // Minnesota
  { id: "KDLH", name: "Duluth, MN", lat: 46.837, lon: -92.210 },
  { id: "KMPX", name: "Minneapolis, MN", lat: 44.849, lon: -93.565 },

  // Mississippi
  { id: "KDGX", name: "Jackson, MS", lat: 32.280, lon: -89.984 },
  { id: "KGWX", name: "Columbus AFB, MS", lat: 33.897, lon: -88.329 },

  // Missouri
  { id: "KEAX", name: "Kansas City, MO", lat: 38.810, lon: -94.264 },
  { id: "KSGF", name: "Springfield, MO", lat: 37.235, lon: -93.401 },
  { id: "KLSX", name: "St. Louis, MO", lat: 38.699, lon: -90.683 },

  // Montana
  { id: "KBLX", name: "Billings, MT", lat: 45.854, lon: -108.607 },
  { id: "KGGW", name: "Glasgow, MT", lat: 48.206, lon: -106.625 },
  { id: "KTFX", name: "Great Falls, MT", lat: 47.460, lon: -111.385 },
  { id: "KMSX", name: "Missoula, MT", lat: 47.041, lon: -113.986 },

  // North Carolina
  { id: "KMHX", name: "Morehead City, NC", lat: 34.776, lon: -76.876 },
  { id: "KRAX", name: "Raleigh, NC", lat: 35.665, lon: -78.490 },
  { id: "KLTX", name: "Wilmington, NC", lat: 33.989, lon: -78.429 },

  // North Dakota
  { id: "KBIS", name: "Bismarck, ND", lat: 46.771, lon: -100.760 },
  { id: "KMVX", name: "Grand Forks, ND", lat: 47.528, lon: -97.325 },
  { id: "KMBX", name: "Minot AFB, ND", lat: 48.393, lon: -100.864 },

  // Nebraska
  { id: "KUEX", name: "Hastings, NE", lat: 40.321, lon: -98.442 },
  { id: "KLNX", name: "North Platte, NE", lat: 41.958, lon: -100.576 },
  { id: "KOAX", name: "Omaha, NE", lat: 41.320, lon: -96.367 },

  // New Hampshire / Vermont
  { id: "KCXX", name: "Burlington, VT", lat: 44.511, lon: -73.166 },

  // New Jersey
  { id: "KDIX", name: "Philadelphia/Mt. Holly, NJ", lat: 39.947, lon: -74.411 },

  // New Mexico
  { id: "KABX", name: "Albuquerque, NM", lat: 35.150, lon: -106.824 },
  { id: "KFDX", name: "Cannon AFB, NM", lat: 34.635, lon: -103.630 },
  { id: "KEPZ", name: "El Paso, TX/NM", lat: 31.873, lon: -106.698 },
  { id: "KHDX", name: "Holloman AFB, NM", lat: 33.077, lon: -106.122 },

  // Nevada
  { id: "KESX", name: "Las Vegas, NV", lat: 35.701, lon: -114.891 },
  { id: "KRGX", name: "Reno, NV", lat: 39.754, lon: -119.462 },
  { id: "KLRX", name: "Elko, NV", lat: 40.740, lon: -116.803 },

  // New York
  { id: "KENX", name: "Albany, NY", lat: 42.586, lon: -74.064 },
  { id: "KBGM", name: "Binghamton, NY", lat: 42.200, lon: -75.985 },
  { id: "KBUF", name: "Buffalo, NY", lat: 42.949, lon: -78.737 },
  { id: "KTYX", name: "Fort Drum, NY", lat: 43.756, lon: -75.680 },
  { id: "KOKX", name: "New York City, NY", lat: 40.866, lon: -72.864 },

  // Ohio
  { id: "KILN", name: "Cincinnati/Wilmington, OH", lat: 39.420, lon: -83.822 },
  { id: "KCLE", name: "Cleveland, OH", lat: 41.413, lon: -81.860 },

  // Oklahoma
  { id: "KFDR", name: "Frederick, OK", lat: 34.362, lon: -98.977 },
  { id: "KTLX", name: "Oklahoma City, OK", lat: 35.333, lon: -97.278 },
  { id: "KINX", name: "Tulsa, OK", lat: 36.175, lon: -95.564 },
  { id: "KVNX", name: "Vance AFB, OK", lat: 36.741, lon: -98.128 },

  // Oregon
  { id: "KMAX", name: "Medford, OR", lat: 42.081, lon: -122.717 },
  { id: "KPDT", name: "Pendleton, OR", lat: 45.691, lon: -118.853 },
  { id: "KRTX", name: "Portland, OR", lat: 45.715, lon: -122.965 },

  // Pennsylvania
  { id: "KPBZ", name: "Pittsburgh, PA", lat: 40.532, lon: -80.218 },
  { id: "KCCX", name: "State College, PA", lat: 40.923, lon: -78.004 },

  // South Carolina
  { id: "KCLX", name: "Charleston, SC", lat: 32.656, lon: -81.042 },
  { id: "KCAE", name: "Columbia, SC", lat: 33.949, lon: -81.118 },
  { id: "KGSP", name: "Greer, SC", lat: 34.883, lon: -82.220 },

  // South Dakota
  { id: "KABR", name: "Aberdeen, SD", lat: 45.456, lon: -98.413 },
  { id: "KUDX", name: "Rapid City, SD", lat: 44.125, lon: -102.830 },
  { id: "KFSD", name: "Sioux Falls, SD", lat: 43.588, lon: -96.729 },

  // Tennessee
  { id: "KMRX", name: "Knoxville, TN", lat: 36.168, lon: -83.402 },
  { id: "KNQA", name: "Memphis, TN", lat: 35.345, lon: -89.873 },
  { id: "KOHX", name: "Nashville, TN", lat: 36.247, lon: -86.563 },

  // Texas
  { id: "KAMA", name: "Amarillo, TX", lat: 35.233, lon: -101.709 },
  { id: "KEWX", name: "Austin/San Antonio, TX", lat: 29.704, lon: -98.029 },
  { id: "KBRO", name: "Brownsville, TX", lat: 25.916, lon: -97.419 },
  { id: "KCRP", name: "Corpus Christi, TX", lat: 27.784, lon: -97.511 },
  { id: "KFWS", name: "Dallas/Fort Worth, TX", lat: 32.573, lon: -97.303 },
  { id: "KDYX", name: "Dyess AFB, TX", lat: 32.538, lon: -99.254 },
  { id: "KHGX", name: "Houston, TX", lat: 29.472, lon: -95.079 },
  { id: "KDFX", name: "Laughlin AFB, TX", lat: 29.273, lon: -100.280 },
  { id: "KLBB", name: "Lubbock, TX", lat: 33.654, lon: -101.814 },
  { id: "KMAF", name: "Midland/Odessa, TX", lat: 31.943, lon: -102.189 },
  { id: "KSJT", name: "San Angelo, TX", lat: 31.371, lon: -100.492 },
  { id: "KGRK", name: "Fort Hood, TX", lat: 30.722, lon: -97.383 },

  // Utah
  { id: "KICX", name: "Cedar City, UT", lat: 37.591, lon: -112.862 },
  { id: "KMTX", name: "Salt Lake City, UT", lat: 41.263, lon: -112.448 },

  // Virginia
  { id: "KFCX", name: "Roanoke, VA", lat: 37.024, lon: -80.274 },
  { id: "KAKQ", name: "Wakefield, VA", lat: 36.984, lon: -77.008 },

  // Washington
  { id: "KLGX", name: "Langley Hill, WA", lat: 47.117, lon: -124.107 },
  { id: "KATX", name: "Seattle, WA", lat: 48.195, lon: -122.496 },
  { id: "KOTX", name: "Spokane, WA", lat: 47.680, lon: -117.627 },

  // Wisconsin
  { id: "KGRB", name: "Green Bay, WI", lat: 44.499, lon: -88.111 },
  { id: "KARX", name: "La Crosse, WI", lat: 43.823, lon: -91.191 },
  { id: "KMKX", name: "Milwaukee, WI", lat: 42.968, lon: -88.551 },

  // West Virginia
  { id: "KRLX", name: "Charleston, WV", lat: 38.311, lon: -81.723 },

  // Wyoming
  { id: "KCYS", name: "Cheyenne, WY", lat: 41.152, lon: -104.806 },
  { id: "KRIW", name: "Riverton, WY", lat: 43.066, lon: -108.477 },
];
