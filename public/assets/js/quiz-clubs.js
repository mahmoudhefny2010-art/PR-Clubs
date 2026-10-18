// Club catalogue for the "Find Your Club" quiz.
//
// Authoritative source: data/clubs.json (public clubs). The ids, names, statuses,
// categories, taglines, descriptions and images below mirror that file. Keep this
// snapshot in sync when data/clubs.json changes.
//
// Only clubs present in the repository records are included. Clubs mentioned in
// external summaries but missing from the repository (for example PACE, Rawi,
// Elwarsha, Sketching, The Jewellery Makers, ActiveX, Entity, Ventures, ASCC,
// AIESEC, Campaigners, Move, MMC and Enactus) are intentionally excluded: their
// active status, routes and descriptions cannot be verified from current project
// records. TEDx MIU is included because it exists in data/clubs.json.
//
// A club is treated as active while its status is not "closed". "Full" clubs are
// still active (at membership capacity); they can be recommended and viewed, but
// cannot be applied to.
window.MiuQuizClubs = (function () {
  'use strict';

  const version = 1;

  const clubs = [
    {
      id: '1',
      name: 'Utopia',
      committee: 'Utopia Club',
      category: 'Innovation',
      tagline: 'Creative projects and student initiatives',
      image: '/assets/img/pics/Utopia.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 1,
      description:
        'A creative student community focused on innovation, leadership, and real-world problem solving.',
      aliases: []
    },
    {
      id: '2',
      name: 'MUN',
      committee: 'Model United Nations',
      category: 'Debate & Leadership',
      tagline: 'Diplomacy, debate, and public speaking',
      image: '/assets/img/pics/mun.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 2,
      description:
        'Develop public speaking, diplomacy, and international relations through model UN experiences.',
      aliases: ['MIU-MUNAL', 'MUN']
    },
    {
      id: '3',
      name: 'CDC',
      committee: 'Career Development Club',
      category: 'Career Growth',
      tagline: 'Career skills and professional growth',
      image: '/assets/img/pics/cdc.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 3,
      description:
        'Helps students build professional skills, career awareness, and future-ready opportunities.',
      aliases: []
    },
    {
      id: '4',
      name: 'Dimas',
      committee: 'Dimas Club',
      category: 'Media & Content',
      tagline: 'Media production and creative content',
      image: '/assets/img/pics/dimas.jpg',
      imageFit: 'contain',
      status: 'full',
      sortOrder: 4,
      description:
        'A media-driven club focused on storytelling, digital content, and creative expression.',
      aliases: ['DIMAS']
    },
    {
      id: '5',
      name: 'IEEE',
      committee: 'IEEE Student Chapter',
      category: 'Technology',
      tagline: 'Engineering, technology, and innovation',
      image: '/assets/img/pics/ieee.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 5,
      description:
        'Connects students with engineering, technology, and innovation through events and projects.',
      aliases: ['IEEE', 'IEEE MIU SB']
    },
    {
      id: '6',
      name: 'ACPC',
      committee: 'ACPC Club',
      category: 'Programming',
      tagline: 'Competitive programming and problem-solving',
      image: '/assets/img/pics/acpc.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 6,
      description:
        'Encourages competitive programming, teamwork, and problem-solving through training and events.',
      aliases: []
    },
    {
      id: '7',
      name: 'Tunners',
      committee: 'Tunners Club',
      category: 'Sports',
      tagline: 'Fitness, sports, and team activities',
      image: '/assets/img/pics/tuners.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 7,
      description:
        'Promotes movement, teamwork, endurance, and active student life through sports activities.',
      aliases: ['Tuners']
    },
    {
      id: '8',
      name: 'Theater',
      committee: 'Theater Club',
      category: 'Arts & Performance',
      tagline: 'Acting, stage performance, and storytelling',
      image: '/assets/img/pics/theater.jpg',
      imageFit: 'contain',
      status: 'full',
      sortOrder: 8,
      description:
        'A performance-focused space for acting, expression, stage work, and creative storytelling.',
      aliases: ['MIU Theatre', 'MTC']
    },
    {
      id: '9',
      name: 'MSP',
      committee: 'MSP Club',
      category: 'Student Life',
      tagline: 'Campus events and student community',
      image: '/assets/img/pics/msp.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 9,
      description:
        'Supports student engagement, community building, and collaborative campus initiatives.',
      aliases: []
    },
    {
      id: '10',
      name: 'Gamers Legacy',
      committee: 'Gamers Legacy Club',
      category: 'Gaming & Esports',
      tagline: 'Gaming, competition, and community',
      image: '/assets/img/pics/gamerslegacy.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 10,
      description:
        'A student gaming community for competitions, events, and connecting players across campus.',
      aliases: []
    },
    {
      id: '11',
      name: 'IHEPC',
      committee: 'International Hepatitis Club',
      category: 'Health Awareness',
      tagline: 'Hepatitis awareness and education',
      image: '/assets/img/pics/ihepc.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 11,
      description:
        'Raises awareness and shares educational information about hepatitis and related health topics.',
      aliases: []
    },
    {
      id: '12',
      name: 'TEDx MIU',
      committee: 'TEDx MIU',
      category: 'Ideas & Events',
      tagline: 'Ideas worth sharing through campus events',
      image: '/assets/img/pics/tedx.jpg',
      imageFit: 'contain',
      status: 'open',
      sortOrder: 12,
      description:
        'Organizes independently hosted TED-style events to bring ideas and speakers to the MIU community.',
      aliases: []
    }
  ];

  const byId = new Map(clubs.map((club) => [club.id, club]));

  function isActive(club) {
    return club.status !== 'closed';
  }

  function activeClubs() {
    return clubs.filter(isActive);
  }

  function find(id) {
    return byId.get(String(id));
  }

  // Detail destination for the "View Club" action. The site opens club details
  // in place on the homepage; from other pages the quiz navigates there.
  function detailHref(clubId) {
    return '/?club=' + encodeURIComponent(clubId);
  }

  return {
    version,
    clubs,
    activeClubs,
    find,
    isActive,
    byId,
    detailHref
  };
})();
