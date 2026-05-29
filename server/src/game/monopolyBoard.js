// ── All 40 board spaces ─────────────────────────────────────
// type: "property" | "railroad" | "utility" | "chance" | "community" | "tax" | "go" | "jail" | "free-parking" | "go-to-jail"
// For properties: group, price, rent (array: [base, 1h, 2h, 3h, 4h, hotel]), houseCost, mortgageValue

export const BOARD = [
  /* 0  */ { index: 0,  type: "go",            name: "GO" },
  /* 1  */ { index: 1,  type: "property",      name: "Mediterranean Avenue", group: "brown",     price: 60,  rent: [2, 10, 30, 90, 160, 250],     houseCost: 50,  mortgageValue: 30 },
  /* 2  */ { index: 2,  type: "community",      name: "Community Chest" },
  /* 3  */ { index: 3,  type: "property",      name: "Baltic Avenue",        group: "brown",     price: 60,  rent: [4, 20, 60, 180, 320, 450],     houseCost: 50,  mortgageValue: 30 },
  /* 4  */ { index: 4,  type: "tax",           name: "Income Tax",           amount: 200 },
  /* 5  */ { index: 5,  type: "railroad",      name: "Reading Railroad",     price: 200, mortgageValue: 100 },
  /* 6  */ { index: 6,  type: "property",      name: "Oriental Avenue",      group: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550],     houseCost: 50,  mortgageValue: 50 },
  /* 7  */ { index: 7,  type: "chance",        name: "Chance" },
  /* 8  */ { index: 8,  type: "property",      name: "Vermont Avenue",       group: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550],     houseCost: 50,  mortgageValue: 50 },
  /* 9  */ { index: 9,  type: "property",      name: "Connecticut Avenue",   group: "lightblue", price: 120, rent: [8, 40, 100, 300, 450, 600],    houseCost: 50,  mortgageValue: 60 },
  /* 10 */ { index: 10, type: "jail",          name: "Jail / Just Visiting" },
  /* 11 */ { index: 11, type: "property",      name: "St. Charles Place",    group: "pink",      price: 140, rent: [10, 50, 150, 450, 625, 750],   houseCost: 100, mortgageValue: 70 },
  /* 12 */ { index: 12, type: "utility",       name: "Electric Company",     price: 150, mortgageValue: 75 },
  /* 13 */ { index: 13, type: "property",      name: "States Avenue",        group: "pink",      price: 140, rent: [10, 50, 150, 450, 625, 750],   houseCost: 100, mortgageValue: 70 },
  /* 14 */ { index: 14, type: "property",      name: "Virginia Avenue",      group: "pink",      price: 160, rent: [12, 60, 180, 500, 700, 900],   houseCost: 100, mortgageValue: 80 },
  /* 15 */ { index: 15, type: "railroad",      name: "Pennsylvania Railroad",price: 200, mortgageValue: 100 },
  /* 16 */ { index: 16, type: "property",      name: "St. James Place",      group: "orange",    price: 180, rent: [14, 70, 200, 550, 750, 950],   houseCost: 100, mortgageValue: 90 },
  /* 17 */ { index: 17, type: "community",      name: "Community Chest" },
  /* 18 */ { index: 18, type: "property",      name: "Tennessee Avenue",     group: "orange",    price: 180, rent: [14, 70, 200, 550, 750, 950],   houseCost: 100, mortgageValue: 90 },
  /* 19 */ { index: 19, type: "property",      name: "New York Avenue",      group: "orange",    price: 200, rent: [16, 80, 220, 600, 800, 1000],  houseCost: 100, mortgageValue: 100 },
  /* 20 */ { index: 20, type: "free-parking",  name: "Free Parking" },
  /* 21 */ { index: 21, type: "property",      name: "Kentucky Avenue",      group: "red",       price: 220, rent: [18, 90, 250, 700, 875, 1050],  houseCost: 150, mortgageValue: 110 },
  /* 22 */ { index: 22, type: "chance",        name: "Chance" },
  /* 23 */ { index: 23, type: "property",      name: "Indiana Avenue",       group: "red",       price: 220, rent: [18, 90, 250, 700, 875, 1050],  houseCost: 150, mortgageValue: 110 },
  /* 24 */ { index: 24, type: "property",      name: "Illinois Avenue",      group: "red",       price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgageValue: 120 },
  /* 25 */ { index: 25, type: "railroad",      name: "B&O Railroad",         price: 200, mortgageValue: 100 },
  /* 26 */ { index: 26, type: "property",      name: "Atlantic Avenue",      group: "yellow",    price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgageValue: 130 },
  /* 27 */ { index: 27, type: "property",      name: "Ventnor Avenue",       group: "yellow",    price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgageValue: 130 },
  /* 28 */ { index: 28, type: "utility",       name: "Water Works",          price: 150, mortgageValue: 75 },
  /* 29 */ { index: 29, type: "property",      name: "Marvin Gardens",       group: "yellow",    price: 280, rent: [24, 120, 360, 850, 1025, 1200],houseCost: 150, mortgageValue: 140 },
  /* 30 */ { index: 30, type: "go-to-jail",    name: "Go To Jail" },
  /* 31 */ { index: 31, type: "property",      name: "Pacific Avenue",       group: "green",     price: 300, rent: [26, 130, 390, 900, 1100, 1275],houseCost: 200, mortgageValue: 150 },
  /* 32 */ { index: 32, type: "property",      name: "North Carolina Avenue",group: "green",     price: 300, rent: [26, 130, 390, 900, 1100, 1275],houseCost: 200, mortgageValue: 150 },
  /* 33 */ { index: 33, type: "community",      name: "Community Chest" },
  /* 34 */ { index: 34, type: "property",      name: "Pennsylvania Avenue",  group: "green",     price: 320, rent: [28, 150, 450, 1000, 1200, 1400],houseCost: 200, mortgageValue: 160 },
  /* 35 */ { index: 35, type: "railroad",      name: "Short Line",           price: 200, mortgageValue: 100 },
  /* 36 */ { index: 36, type: "chance",        name: "Chance" },
  /* 37 */ { index: 37, type: "property",      name: "Park Place",           group: "darkblue",  price: 350, rent: [35, 175, 500, 1100, 1300, 1500],houseCost: 200, mortgageValue: 175 },
  /* 38 */ { index: 38, type: "tax",           name: "Luxury Tax",           amount: 100 },
  /* 39 */ { index: 39, type: "property",      name: "Boardwalk",            group: "darkblue",  price: 400, rent: [50, 200, 600, 1400, 1700, 2000],houseCost: 200, mortgageValue: 200 },
];

// Which property indices belong to each group
export const GROUP_MEMBERS = {
  brown:     [1, 3],
  lightblue: [6, 8, 9],
  pink:      [11, 13, 14],
  orange:    [16, 18, 19],
  red:       [21, 23, 24],
  yellow:    [26, 27, 29],
  green:     [31, 32, 34],
  darkblue:  [37, 39],
};

export const RAILROADS = [5, 15, 25, 35];
export const UTILITIES = [12, 28];

export const GROUP_COLORS = {
  brown:     "#8B4513",
  lightblue: "#87CEEB",
  pink:      "#FF69B4",
  orange:    "#FFA500",
  red:       "#FF0000",
  yellow:    "#FFD700",
  green:     "#00A651",
  darkblue:  "#0000CD",
};

// Railroad rent: $25 per railroad owned (25, 50, 100, 200)
export const RAILROAD_RENT = [25, 50, 100, 200];

// Utility rent multiplier: 4x dice if 1 owned, 10x dice if 2 owned
export const UTILITY_MULT = [4, 10];

// ── Chance cards ────────────────────────────────────────────
export const CHANCE_CARDS = [
  { text: "Advance to Boardwalk.",                           action: "moveTo",         params: { position: 39 } },
  { text: "Advance to Go. Collect $200.",                    action: "moveTo",         params: { position: 0 } },
  { text: "Advance to Illinois Avenue.",                     action: "moveTo",         params: { position: 24 } },
  { text: "Advance to St. Charles Place.",                   action: "moveTo",         params: { position: 11 } },
  { text: "Advance to the nearest Railroad.",                action: "nearestRailroad",params: {} },
  { text: "Advance to the nearest Railroad.",                action: "nearestRailroad",params: {} },
  { text: "Advance to the nearest Utility.",                 action: "nearestUtility", params: {} },
  { text: "Bank pays you dividend of $50.",                  action: "collect",        params: { amount: 50 } },
  { text: "Get Out of Jail Free.",                           action: "jailCard",       params: {} },
  { text: "Go back 3 spaces.",                               action: "moveBack",       params: { spaces: 3 } },
  { text: "Go to Jail. Do not pass Go. Do not collect $200.",action: "goToJail",       params: {} },
  { text: "Make general repairs: $25 per house, $100 per hotel.", action: "repairs",   params: { perHouse: 25, perHotel: 100 } },
  { text: "Speeding fine $15.",                              action: "pay",            params: { amount: 15 } },
  { text: "Take a trip to Reading Railroad.",                action: "moveTo",         params: { position: 5 } },
  { text: "You have been elected chairman. Pay each player $50.", action: "payEach",   params: { amount: 50 } },
  { text: "Your building loan matures. Collect $150.",       action: "collect",        params: { amount: 150 } },
];

// ── Community Chest cards ───────────────────────────────────
export const COMMUNITY_CARDS = [
  { text: "Advance to Go. Collect $200.",                    action: "moveTo",         params: { position: 0 } },
  { text: "Bank error in your favor. Collect $200.",         action: "collect",        params: { amount: 200 } },
  { text: "Doctor's fee. Pay $50.",                          action: "pay",            params: { amount: 50 } },
  { text: "From sale of stock you get $50.",                 action: "collect",        params: { amount: 50 } },
  { text: "Get Out of Jail Free.",                           action: "jailCard",       params: {} },
  { text: "Go to Jail. Do not pass Go. Do not collect $200.",action: "goToJail",       params: {} },
  { text: "Holiday fund matures. Receive $100.",             action: "collect",        params: { amount: 100 } },
  { text: "Income tax refund. Collect $20.",                 action: "collect",        params: { amount: 20 } },
  { text: "It is your birthday. Collect $10 from every player.", action: "collectEach",params: { amount: 10 } },
  { text: "Life insurance matures. Collect $100.",           action: "collect",        params: { amount: 100 } },
  { text: "Pay hospital fees of $100.",                      action: "pay",            params: { amount: 100 } },
  { text: "Pay school fees of $50.",                         action: "pay",            params: { amount: 50 } },
  { text: "Receive $25 consultancy fee.",                    action: "collect",        params: { amount: 25 } },
  { text: "You are assessed for street repair: $40 per house, $115 per hotel.", action: "repairs", params: { perHouse: 40, perHotel: 115 } },
  { text: "You have won second prize in a beauty contest. Collect $10.", action: "collect", params: { amount: 10 } },
  { text: "You inherit $100.",                               action: "collect",        params: { amount: 100 } },
];

export function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
