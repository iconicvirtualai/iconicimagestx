/**
 * People shown on https://www.iconicimagestx.com/crew (October 2026).
 * Bios are the personal paragraphs from each linked profile page.
 * Wording is kept; only obvious typos were cleaned.
 * Janie is on the crew grid with a headshot and no profile page.
 */

export type CrewMember = {
  id: string;
  name: string;
  roles: string[];
  bio: string;
  photo: string;
};

export const CREW_JOIN_HREF = "/apprenticeship";

export const CREW: readonly CrewMember[] = [
  {
    id: "armando",
    name: "Armando",
    roles: [
      "Photographer",
      "Videographer",
      "Drone Operator",
      "3D Tours",
      "Reels & Social Media",
      "*Bi-Lingual*",
    ],
    bio: "I was born in Mexico and raised in Houston, TX. I studied Television and Film Production at the University of Texas at Austin, and have been working as a professional photographer since 2013. A lover of tacos, video games, and an aspiring BBQ Pitmaster. I always look forward to meeting new clients and providing them with outstanding service!",
    photo: "/media/crew/armando.webp",
  },
  {
    id: "daniel",
    name: "Daniel",
    roles: [
      "Photographer",
      "Videographer",
      "Drone Operator",
      "3D Tours",
      "Reels & Social Media",
    ],
    bio: "Hi, I'm Daniel! I've been a professional photographer since 2012 and went to school for kinesiology. Besides photography, I also enjoy playing and creating music, traveling, dancing, and playing video games!",
    photo: "/media/crew/daniel.webp",
  },
  {
    id: "pedro",
    name: "Pedro",
    roles: [
      "Photographer",
      "Drone Operator",
      "3D Tours",
      "Reels & Social Media",
      "*Bi-Lingual*",
    ],
    bio: "Hey, I'm Pedro! I was born in Mexico, grew up in Texas, served in the USMC, and wear many hats. I have two kids, shoot photography, and I like working on cars. I love meeting new people and enjoy the outdoors and a good ol' glass of whiskey.",
    photo: "/media/crew/pedro.webp",
  },
  {
    id: "david",
    name: "David",
    roles: ["Photographer", "Videographer", "Drone Operator", "3D Tours"],
    bio: "I am David Gonzales, a professional photographer, husband, and father of four. Through the lens of my camera, a cherished companion, I have the privilege of capturing and sharing meaningful moments with others, for which I am truly grateful.",
    photo: "/media/crew/david.webp",
  },
  {
    id: "mike",
    name: "Mike",
    roles: ["Media Producer", "Videographer"],
    bio: "Hi, I'm Mike! I'm originally from Illinois but I've lived in Texas most of my life. I'm married and have two little girls. I love Star Wars, coffee, and music, but not necessarily in that order.",
    photo: "/media/crew/mike.webp",
  },
  {
    id: "cadi",
    name: "Cadi",
    roles: ["Owner"],
    bio: "Hey, I'm Cadi! Born in Illinois but grew up in Texas. After graduating, I ventured off to the East Coast where I completely fell in love with the beauty of the world and decided to create my own path. After moving back to Texas, my fam & I set out to create a life of adventure and freedom. We've been going with the flow ever since!",
    photo: "/media/crew/cadi.webp",
  },
  {
    id: "janie",
    name: "Janie",
    roles: ["Marketing Assistant", "Content Creation & Special Projects"],
    bio: "",
    photo: "/media/crew/janie.webp",
  },
];
