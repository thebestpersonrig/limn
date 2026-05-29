export const BOARD = [
  { i: 0,  type: "go",           name: "GO" },
  { i: 1,  type: "property",     name: "Mediterranean Ave", short: "Mediter.", group: "brown",     price: 60,  rent: [2,10,30,90,160,250],       houseCost: 50 },
  { i: 2,  type: "community",    name: "Community Chest" },
  { i: 3,  type: "property",     name: "Baltic Ave",        short: "Baltic",   group: "brown",     price: 60,  rent: [4,20,60,180,320,450],      houseCost: 50 },
  { i: 4,  type: "tax",          name: "Income Tax",        amount: 200 },
  { i: 5,  type: "railroad",     name: "Reading Railroad",  short: "Reading",  price: 200 },
  { i: 6,  type: "property",     name: "Oriental Ave",      short: "Oriental", group: "lightblue", price: 100, rent: [6,30,90,270,400,550],      houseCost: 50 },
  { i: 7,  type: "chance",       name: "Chance" },
  { i: 8,  type: "property",     name: "Vermont Ave",       short: "Vermont",  group: "lightblue", price: 100, rent: [6,30,90,270,400,550],      houseCost: 50 },
  { i: 9,  type: "property",     name: "Connecticut Ave",   short: "Connect.", group: "lightblue", price: 120, rent: [8,40,100,300,450,600],     houseCost: 50 },
  { i: 10, type: "jail",         name: "Jail" },
  { i: 11, type: "property",     name: "St. Charles Place", short: "St.Charles",group: "pink",     price: 140, rent: [10,50,150,450,625,750],    houseCost: 100 },
  { i: 12, type: "utility",      name: "Electric Company",  short: "Electric", price: 150 },
  { i: 13, type: "property",     name: "States Ave",        short: "States",   group: "pink",      price: 140, rent: [10,50,150,450,625,750],    houseCost: 100 },
  { i: 14, type: "property",     name: "Virginia Ave",      short: "Virginia", group: "pink",      price: 160, rent: [12,60,180,500,700,900],    houseCost: 100 },
  { i: 15, type: "railroad",     name: "Pennsylvania RR",   short: "Penn. RR", price: 200 },
  { i: 16, type: "property",     name: "St. James Place",   short: "St.James", group: "orange",    price: 180, rent: [14,70,200,550,750,950],    houseCost: 100 },
  { i: 17, type: "community",    name: "Community Chest" },
  { i: 18, type: "property",     name: "Tennessee Ave",     short: "Tenness.", group: "orange",    price: 180, rent: [14,70,200,550,750,950],    houseCost: 100 },
  { i: 19, type: "property",     name: "New York Ave",      short: "New York", group: "orange",    price: 200, rent: [16,80,220,600,800,1000],   houseCost: 100 },
  { i: 20, type: "free-parking", name: "Free Parking" },
  { i: 21, type: "property",     name: "Kentucky Ave",      short: "Kentucky", group: "red",       price: 220, rent: [18,90,250,700,875,1050],   houseCost: 150 },
  { i: 22, type: "chance",       name: "Chance" },
  { i: 23, type: "property",     name: "Indiana Ave",       short: "Indiana",  group: "red",       price: 220, rent: [18,90,250,700,875,1050],   houseCost: 150 },
  { i: 24, type: "property",     name: "Illinois Ave",      short: "Illinois", group: "red",       price: 240, rent: [20,100,300,750,925,1100],  houseCost: 150 },
  { i: 25, type: "railroad",     name: "B&O Railroad",      short: "B. & O.",  price: 200 },
  { i: 26, type: "property",     name: "Atlantic Ave",      short: "Atlantic", group: "yellow",    price: 260, rent: [22,110,330,800,975,1150],  houseCost: 150 },
  { i: 27, type: "property",     name: "Ventnor Ave",       short: "Ventnor",  group: "yellow",    price: 260, rent: [22,110,330,800,975,1150],  houseCost: 150 },
  { i: 28, type: "utility",      name: "Water Works",       short: "Water Wk", price: 150 },
  { i: 29, type: "property",     name: "Marvin Gardens",    short: "Marvin",   group: "yellow",    price: 280, rent: [24,120,360,850,1025,1200], houseCost: 150 },
  { i: 30, type: "go-to-jail",   name: "Go To Jail" },
  { i: 31, type: "property",     name: "Pacific Ave",       short: "Pacific",  group: "green",     price: 300, rent: [26,130,390,900,1100,1275], houseCost: 200 },
  { i: 32, type: "property",     name: "N. Carolina Ave",   short: "N.Carol.", group: "green",     price: 300, rent: [26,130,390,900,1100,1275], houseCost: 200 },
  { i: 33, type: "community",    name: "Community Chest" },
  { i: 34, type: "property",     name: "Pennsylvania Ave",  short: "Penn.Ave", group: "green",     price: 320, rent: [28,150,450,1000,1200,1400],houseCost: 200 },
  { i: 35, type: "railroad",     name: "Short Line",        short: "Short Ln", price: 200 },
  { i: 36, type: "chance",       name: "Chance" },
  { i: 37, type: "property",     name: "Park Place",        short: "Park Pl.", group: "darkblue",  price: 350, rent: [35,175,500,1100,1300,1500],houseCost: 200 },
  { i: 38, type: "tax",          name: "Luxury Tax",        amount: 100 },
  { i: 39, type: "property",     name: "Boardwalk",         short: "Boardwalk",group: "darkblue",  price: 400, rent: [50,200,600,1400,1700,2000],houseCost: 200 },
];

export const GROUP_COLORS = {
  brown:     "#8B4513",
  lightblue: "#87CEEB",
  pink:      "#E91E8C",
  orange:    "#F7941D",
  red:       "#ED1B24",
  yellow:    "#FFD700",
  green:     "#1FB25A",
  darkblue:  "#0055C4",
};

export const GROUP_SIZES = { brown: 2, lightblue: 3, pink: 3, orange: 3, red: 3, yellow: 3, green: 3, darkblue: 2 };

export const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

export function getSpacePos(index) {
  if (index <= 10) return { row: 11, col: 11 - index, side: index === 0 || index === 10 ? "corner" : "bottom" };
  if (index <= 19) return { row: 21 - index, col: 1, side: "left" };
  if (index === 20) return { row: 1, col: 1, side: "corner" };
  if (index <= 29) return { row: 1, col: index - 19, side: "top" };
  if (index === 30) return { row: 1, col: 11, side: "corner" };
  if (index <= 39) return { row: index - 29, col: 11, side: "right" };
  return { row: 1, col: 1, side: "corner" };
}
