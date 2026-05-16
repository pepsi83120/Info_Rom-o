export const STORE_KEY = "villa-romeo-admin-v1";

const sharedAccess = {
  wifi: "LavillaRoméo",
  wifiPass: "roméo83120",
  doorCode: "Code portail : 2346",
  parking: "Pas de parking privatif",
  checkin: "16:00",
  checkout: "10:00",
  minibar: "Petit-dejeuner disponible sur demande : 13 EUR adulte, 8 EUR enfant.",
  rules: "Les animaux ne sont pas acceptes. Logement non-fumeur. Merci de deposer les draps dans le sac mis a disposition avant votre depart.",
  arrivalInstructions: "Horaires piscine : 10h00 - 20h00."
};

const clientPasswords = {
  1: "Minivillarose48291",
  2: "Minivillaverte73504",
  3: "Minivillableue19682",
  4: "Minivillajaune58437",
  5: "CottageJuliette92015"
};

function suite(id, name, guests, surface, nightlyRate, color, category = "Hebergement de charme") {
  return {
    id,
    name,
    clientLogin: {
      username: name,
      password: clientPasswords[id]
    },
    category,
    publicName: name,
    villaType: category,
    ambience: "Charme, calme, piscine et jacuzzi",
    status: "free",
    nightlyRate,
    surface,
    guests,
    floor: "Rez-de-chaussee",
    color,
    view: "Pas de vue particuliere",
    housekeeping: "ready",
    nextCheckout: "",
    currentGuest: "",
    arrival: "",
    departure: "",
    guestPhone: "",
    preferredLanguage: "Francais, Anglais",
    breakfastIncluded: "optional",
    welcome: `Bienvenue a La villa Romeo. Nous vous souhaitons un sejour doux et reposant au coeur du Golfe de Saint-Tropez. Toute l'equipe reste disponible pour vous accompagner avec attention.`,
    guestIntro: `Bienvenue a La villa Romeo. Profitez de votre hebergement, de la piscine et du jacuzzi dans une atmosphere chaleureuse et elegante.`,
    internalNotes: "",
    photo: "",
    qrUrl: `guest.html?suite=${id}`,
    ...sharedAccess
  };
}

export const defaultState = {
  settings: {
    propertyName: "La villa Roméo",
    descriptor: "Hebergements de charme avec piscine & jacuzzi au coeur du Golfe de Saint-Tropez",
    adminName: "La villa Roméo",
    phone: "06 60 45 87 78",
    email: "info@lavillaromeo.fr",
    address: "81 chemins des Aoucellouns, Sainte-Maxime 83120",
    publicBaseUrl: "http://192.168.1.205:4174/",
    planningIcsUrl: "https://www.planning-planning.com/ICS/Planning-Planning-ufddgc.ics",
    planningDefaultSuiteId: 2,
    planningIcsUrls: {
      1: "https://www.planning-planning.com/ICS/Planning-Planning-ntcvyd.ics",
      2: "https://www.planning-planning.com/ICS/Planning-Planning-ufddgc.ics",
      3: "https://www.planning-planning.com/ICS/Planning-Planning-bweaaa.ics",
      4: "https://www.planning-planning.com/ICS/Planning-Planning-rhchtf.ics",
      5: "https://www.planning-planning.com/ICS/Planning-Planning-bweaaa.ics"
    },
    checkin: "16:00",
    checkout: "10:00",
    currency: "EUR",
    language: "Francais, Anglais",
    primaryColor: "#1F9AA0",
    accentColor: "#F2B66D",
    welcomeNote: "Bienvenue a La villa Romeo. Nous vous accueillons dans un cadre chaleureux et raffine, avec piscine et jacuzzi, au coeur du Golfe de Saint-Tropez. Nous restons disponibles pour faciliter votre sejour.",
    signature: "La villa Roméo",
    guestEyebrow: "Bienvenue a La villa Romeo",
    guestHeroTitle: "Votre espace sejour",
    guestHeroText: "Retrouvez les informations utiles de votre hebergement, demandez un petit-dejeuner et contactez-nous simplement pendant votre sejour.",
    guestBreakfastTitle: "Petit-dejeuner",
    guestBreakfastText: "Service de 8h a 9h30. 13 EUR adulte, 8 EUR enfant.",
    guestCallTitle: "Appeler",
    guestCallText: "Contact direct avec La villa Romeo.",
    guestMessageTitle: "Demande speciale",
    guestMessageText: "Envoyez-nous une question ou une demande pendant votre sejour.",
    guestWifiTitle: "Wi-Fi & acces",
    guestWifiText: "Copiez le reseau Wi-Fi et retrouvez le code portail.",
    guestInfoTitle: "Informations sejour",
    guestInfoText: "Acces, Wi-Fi, horaires et regles utiles.",
    guestContactTitle: "La villa Romeo",
    guestBreakfastDefaultOrder: "2 cafes, 2 jus d'orange, viennoiseries et pain frais.",
    guestBreakfastOptions: "Petit-dejeuner classique",
    guestShowSuitePicker: "no",
    guestFooterText: "Nous vous souhaitons un tres beau sejour a La villa Romeo."
  },
  suites: [
    suite(1, "Mini villa rose", 4, "52 m2", 250, "#B8758A"),
    suite(2, "Mini villa verte", 4, "52 m2", 250, "#6F8367"),
    suite(3, "Mini villa bleue", 4, "52 m2", 250, "#4A8FA8"),
    suite(4, "Mini villa jaune", 4, "52 m2", 250, "#C9A765"),
    suite(5, "Cottage Juliette", 2, "25 m2", 200, "#9E6658", "Cottage de charme")
  ],
  reservations: [],
  breakfasts: [
    {
      id: 1,
      suiteId: 1,
      date: "2026-05-16",
      time: "08:30",
      people: 2,
      order: "Petit-dejeuner classique - 2 cafes, 2 jus d'orange, viennoiseries et pain frais.",
      status: "new"
    }
  ],
  tasks: [],
  events: [
    {
      id: 1,
      title: "Marche de Sainte-Maxime",
      date: "2026-05-16",
      time: "09:00",
      location: "Centre-ville de Sainte-Maxime",
      category: "Sortie locale",
      description: "Produits locaux, artisans et ambiance provencale a quelques minutes de La villa Romeo.",
      requiresRegistration: false,
      capacity: 0,
      registrationOpen: false,
      registrations: [],
      active: true
    }
  ],
  temperatures: {
    pool: { morning: "27", afternoon: "28", evening: "27" },
    air: { morning: "22", afternoon: "26", evening: "21" },
    sea: { morning: "20", afternoon: "21", evening: "20" },
    updatedAt: ""
  },
  services: [],
  messages: []
};
