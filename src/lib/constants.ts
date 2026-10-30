/**
 * Constants and configuration for FoodBridge
 */

export const FOOD_CATEGORIES = [
  { value: 'COOKED_MEALS', label: 'Cooked Meals' },
  { value: 'RAW_VEGETABLES', label: 'Raw Vegetables' },
  { value: 'RAW_FRUITS', label: 'Raw Fruits' },
  { value: 'BAKERY', label: 'Bakery Items' },
  { value: 'DAIRY', label: 'Dairy Products' },
  { value: 'BEVERAGES', label: 'Beverages' },
  { value: 'PACKAGED', label: 'Packaged Food' },
  { value: 'MIXED', label: 'Mixed' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const FOOD_TYPES = [
  { value: 'VEGETARIAN', label: 'Vegetarian', emoji: '🥬' },
  { value: 'NON_VEGETARIAN', label: 'Non-Vegetarian', emoji: '🍗' },
  { value: 'VEGAN', label: 'Vegan', emoji: '🌱' },
] as const;

export const ORGANISATION_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'catering', label: 'Catering Company' },
  { value: 'event_organiser', label: 'Event Organiser' },
  { value: 'college_mess', label: 'College Mess Hall' },
  { value: 'other', label: 'Other' },
] as const;

export const VEHICLE_TYPES = [
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'bike', label: 'Motorcycle/Scooter' },
  { value: 'car', label: 'Car' },
  { value: 'walking', label: 'On Foot' },
] as const;

export const QUANTITY_UNITS = [
  { value: 'MEALS', label: 'Meals' },
  { value: 'KG', label: 'Kilograms (kg)' },
] as const;

// Jaipur coordinates for demo data
export const JAIPUR_LOCATIONS = {
  mansarovar: { lat: 26.8505, lng: 75.7646, address: 'Mansarovar, Jaipur, Rajasthan 302020' },
  malviyaNagar: { lat: 26.8553, lng: 75.8057, address: 'Malviya Nagar, Jaipur, Rajasthan 302017' },
  vaishaliNagar: { lat: 26.9104, lng: 75.7354, address: 'Vaishali Nagar, Jaipur, Rajasthan 302021' },
  cScheme: { lat: 26.9012, lng: 75.7985, address: 'C-Scheme, Jaipur, Rajasthan 302001' },
  jagatpura: { lat: 26.8191, lng: 75.8545, address: 'Jagatpura, Jaipur, Rajasthan 302017' },
  tonkRoad: { lat: 26.8356, lng: 75.8115, address: 'Tonk Road, Jaipur, Rajasthan 302015' },
  sikarRoad: { lat: 26.9535, lng: 75.7221, address: 'Sikar Road, Jaipur, Rajasthan 302023' },
  sodala: { lat: 26.9224, lng: 75.7694, address: 'Sodala, Jaipur, Rajasthan 302006' },
  baniPark: { lat: 26.9299, lng: 75.7855, address: 'Bani Park, Jaipur, Rajasthan 302006' },
  jhotwara: { lat: 26.9377, lng: 75.7389, address: 'Jhotwara, Jaipur, Rajasthan 302012' },
} as const;
