export const words = [
  // Animals
  "cat", "dog", "fish", "bird", "frog", "snake", "pig", "cow", "horse", "sheep",
  "rabbit", "duck", "bee", "ant", "bear", "lion", "tiger", "elephant", "monkey",
  "penguin", "owl", "butterfly", "snail", "crab", "turtle", "shark", "whale",
  "octopus", "flamingo", "bat", "fox", "wolf", "deer", "giraffe", "zebra", "parrot",
  "eagle", "swan", "jellyfish", "lobster", "hamster", "panda", "koala", "kangaroo",
  "gorilla", "crocodile", "seal", "dolphin", "hedgehog", "squirrel", "peacock",
  "toucan", "chipmunk", "moose", "bison", "camel", "llama", "otter", "walrus",
  "narwhal", "axolotl", "chameleon", "gecko", "parrot", "rooster", "chick",
  "tadpole", "worm", "caterpillar", "dragonfly", "ladybug", "grasshopper", "mosquito",
  "spider", "scorpion", "crab", "shrimp", "starfish", "clam", "snail", "slug",

  // Food & Drinks
  "apple", "banana", "pizza", "cake", "ice cream", "hot dog", "burger", "cookie",
  "bread", "egg", "donut", "taco", "watermelon", "strawberry", "cherry", "grape",
  "lemon", "orange", "pear", "pineapple", "muffin", "candy", "sandwich", "fries",
  "popcorn", "waffle", "pancake", "sushi", "carrot", "broccoli", "corn", "mushroom",
  "onion", "tomato", "avocado", "pepper", "potato", "pretzel", "croissant", "bagel",
  "spaghetti", "ramen", "dumpling", "burrito", "nachos", "churro", "macaron",
  "cupcake", "lollipop", "chocolate", "candy cane", "gummy bear", "marshmallow",
  "smoothie", "milkshake", "coffee", "tea", "juice", "soda", "popsicle", "pudding",
  "cheesecake", "brownie", "biscuit", "cracker", "ketchup", "mustard", "pickle",

  // Household Objects
  "chair", "table", "bed", "door", "window", "clock", "lamp", "mirror", "pillow",
  "cup", "spoon", "fork", "knife", "plate", "pot", "pan", "kettle", "toaster",
  "fridge", "oven", "sink", "toilet", "bathtub", "shower", "soap", "toothbrush",
  "comb", "scissors", "broom", "mop", "bucket", "trash can", "ladder", "toolbox",
  "hammer", "screw", "nail", "wrench", "saw", "paint brush", "candle", "vase",
  "picture frame", "bookshelf", "couch", "rug", "curtain", "umbrella", "hanger",
  "iron", "sewing needle", "thread", "button", "zipper", "lock", "key",

  // Clothing & Accessories
  "hat", "sock", "shoe", "boot", "crown", "glasses", "ring", "scarf", "belt",
  "bow tie", "glove", "mask", "jacket", "shirt", "shorts", "skirt", "dress",
  "tie", "backpack", "purse", "wallet", "watch", "necklace", "earring", "bracelet",
  "sneaker", "sandal", "flip flop", "helmet", "cap", "beanie",

  // Nature & Weather
  "sun", "moon", "star", "cloud", "rain", "snow", "lightning", "rainbow", "tornado",
  "tree", "flower", "leaf", "cactus", "mushroom", "grass", "bush", "vine",
  "mountain", "volcano", "cave", "lake", "river", "waterfall", "beach", "island",
  "desert", "forest", "snowflake", "icicle", "wave", "rock", "cliff", "glacier",
  "puddle", "mud", "sand", "pebble", "seed", "sprout", "log", "stump",

  // Buildings & Places
  "house", "castle", "igloo", "tent", "barn", "lighthouse", "windmill", "tower",
  "bridge", "tunnel", "well", "fountain", "statue", "pyramid", "church", "school",
  "hospital", "bank", "shop", "library", "museum", "stadium", "airport", "station",
  "prison", "hotel", "cinema", "factory", "greenhouse", "treehouse",

  // Vehicles & Transport
  "car", "bus", "truck", "bike", "motorcycle", "scooter", "skateboard", "boat",
  "ship", "submarine", "plane", "helicopter", "rocket", "hot air balloon", "train",
  "tram", "taxi", "ambulance", "fire truck", "tractor", "bulldozer", "crane",
  "canoe", "surfboard", "sleigh", "wagon",

  // Sports & Activities
  "soccer ball", "basketball", "tennis racket", "baseball bat", "bowling ball",
  "golf club", "football", "volleyball", "frisbee", "kite", "fishing rod",
  "surfing", "skiing", "ice skating", "boxing gloves", "medal", "trophy",
  "dart", "bow and arrow", "slingshot", "jump rope",

  // Music & Art
  "guitar", "piano", "drum", "trumpet", "violin", "microphone", "headphones",
  "music note", "paintbrush", "palette", "pencil", "crayon", "ruler", "compass",
  "camera", "film", "trophy", "ticket", "mask", "stage curtain",

  // Fantasy & Fun
  "dragon", "unicorn", "mermaid", "ghost", "robot", "alien", "wizard", "witch",
  "vampire", "zombie", "pirate", "knight", "ninja", "superhero", "fairy",
  "elf", "dwarf", "giant", "phoenix", "griffin", "spaceship", "ufo",
  "magic wand", "crystal ball", "treasure chest", "map", "compass",
  "potion", "sword", "shield", "bow", "arrow", "bomb", "cannon",

  // Everyday Actions (draw a stick figure doing it)
  "sleeping", "eating", "running", "jumping", "swimming", "dancing", "singing",
  "reading", "writing", "cooking", "driving", "flying", "crying", "laughing",
  "clapping", "waving", "climbing", "digging", "fishing", "painting",

  // Simple Concepts
  "heart", "star", "diamond", "circle", "arrow", "question mark", "exclamation",
  "smiley face", "sad face", "thumbs up", "peace sign", "crossbones",
  "flag", "sign", "traffic light", "fire", "water drop", "earth", "moon",

  // Misc fun
  "present", "birthday cake", "party hat", "balloon", "confetti", "fireworks",
  "candle", "lantern", "campfire", "bonfire", "smoke", "explosion",
  "footprint", "shadow", "echo", "bubble", "tornado", "whirlpool",
  "hourglass", "calendar", "newspaper", "envelope", "stamp", "package",
  "coin", "money bag", "credit card", "receipt", "magnifying glass",
  "microscope", "telescope", "binoculars", "thermometer", "barometer",
];

export function getRandomWords(count = 3) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
