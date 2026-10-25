// EDIT HERE: Change the parcel rows below to try different demo stock.
const parcelRows = [
  ['55667788', 'Milk packs', 2, 6, 9],
  ['55667789', 'Flour sack', 20, 90, 32],
  ['55667790', 'Rice bag', 8, 120, 45],
  ['55667791', 'Cooking oil', 12, 180, 60],
  ['55667792', 'Yogurt cups', 3, 4, 7],
  ['55667793', 'Cereal box', 1, 150, 35],
  ['55667794', 'Potato sack', 18, 30, 18],
  ['55667795', 'Tomato crate', 9, 5, 8],
  ['55667796', 'Soap cartons', 14, 365, 90],
  ['55667797', 'Tea boxes', 4, 240, 75],
  ['55667798', 'Bread loaves', 6, 2, 4],
  ['55667799', 'Lentil bag', 10, 150, 50],
  ['55667800', 'Apple crate', 16, 14, 10],
  ['55667801', 'Pasta packs', 7, 200, 58],
  ['55667802', 'Cheese packs', 5, 12, 15],
  ['55667803', 'Sugar sack', 22, 300, 100],
  ['55667804', 'Orange crate', 13, 16, 12],
  ['55667805', 'Coffee jars', 8, 270, 80],
  ['55667806', 'Leafy greens', 4, 3, 6],
  ['55667807', 'Juice cartons', 11, 100, 45],
  ['55667808', 'Chickpea bag', 9, 160, 52],
  ['55667809', 'Butter packs', 3, 10, 8],
  ['55667810', 'Onion sack', 15, 28, 20],
  ['55667811', 'Water bottles', 12, 300, 110],
  ['55667812', 'Egg trays', 8, 14, 11],
  ['55667813', 'Spice boxes', 2, 240, 70],
  ['55667814', 'Frozen peas', 7, 60, 25],
  ['55667815', 'Cornmeal bag', 10, 180, 65],
  ['55667816', 'Banana crate', 19, 5, 4],
  ['55667817', 'Canned beans', 14, 500, 130],
  ['55667818', 'Carrot crate', 8, 9, 7],
  ['55667819', 'Oat bags', 6, 210, 78],
  ['55667820', 'Flour sack', 20, 90, 32],
  ['55667821', 'Rice bag', 8, 120, 45],
  ['55667822', 'Cooking oil', 12, 180, 60],
  ['55667823', 'Yogurt cups', 3, 4, 7],
  ['55667824', 'Cereal box', 1, 150, 35],
  ['55667825', 'Potato sack', 18, 30, 18],
  ['55667826', 'Tomato crate', 9, 5, 8],
  ['55667827', 'Soap cartons', 14, 365, 90],
  ['55667828', 'Tea boxes', 4, 240, 75],
  ['55667829', 'Bread loaves', 6, 2, 4],
  ['55667830', 'Lentil bag', 10, 150, 50],
];

// EDIT HERE: Parcels under 10 kg go left; 10 kg and over go right.
export function laneFor(weight_kg) {
  return weight_kg >= 10 ? 'R' : 'L';
}

export function isAtRisk(parcel) {
  return parcel.predicted_sold_in_days > parcel.expiry_in_days;
}

export const parcels = parcelRows.slice(0, 32).map(
  ([tag_uid, product, weight_kg, expiry_in_days, predicted_sold_in_days]) => ({
    tag_uid,
    product,
    weight_kg,
    expiry_in_days,
    predicted_sold_in_days,
  }),
);

const wentLeft = parcels.filter((parcel) => laneFor(parcel.weight_kg) === 'L').length;
const wentRight = parcels.filter((parcel) => laneFor(parcel.weight_kg) === 'R').length;
let nextTagId = 55667831;
const randomProducts = [
  ['Almond milk', 8, 10, 7],
  ['Peanut butter jars', 5, 200, 18],
  ['Sparkling water pack', 18, 365, 8],
  ['Avocados', 3, 4, 6],
  ['Pasta bags', 12, 300, 20],
  ['Butter blocks', 7, 30, 12],
  ['Mineral water crate', 24, 365, 5],
  ['Mango pulp cans', 11, 180, 40],
];

export function generateRandomParcel() {
  const [product, weight_kg, expiry_in_days, predicted_sold_in_days] = randomProducts[
    Math.floor(Math.random() * randomProducts.length)
  ];
  nextTagId += 1;
  return { tag_uid: String(nextTagId), product, weight_kg, expiry_in_days, predicted_sold_in_days };
}

const forecastCounts = [45, 38, 41, 36, 45, 52, 39];

export const MOCK_DATA = {
  parcels,
  expected_today: 45,
  base_counts: {
    arrived: parcels.length,
    went_left: wentLeft,
    went_right: wentRight,
    at_risk: parcels.filter(isAtRisk).length,
  },
  // EDIT HERE: Simulated expected parcel counts, starting with today.
  forecast: forecastCounts.map((count, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      day: index === 0 ? 'Today' : index === 1
        ? 'Tomorrow'
        : new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date),
      count,
    };
  }),
};
