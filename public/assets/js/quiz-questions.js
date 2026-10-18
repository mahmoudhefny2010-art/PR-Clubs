// "Find Your Club" quiz questions and scoring options.
//
// Club keys are the string ids from MiuQuizClubs (mirroring data/clubs.json):
// '1' Utopia · '2' MUN · '3' CDC · '4' Dimas · '5' IEEE · '6' ACPC ·
// '7' Tunners · '8' Theater · '9' MSP · '10' Gamers Legacy · '11' IHEPC · '12' TEDx MIU.
//
// clubPoints values: 3 = direct match with a documented main activity,
// 2 = strong related match, 1 = weak but defensible connection, 0 = none.
// Explanations are deterministic reason sentences generated from the answers the
// student actually selected. Every (option, club) pair with points > 0 must have
// an explanation entry (validated by MiuQuizScoring).
//
// Weights (editorial initial rules, not empirically proven):
//   Primary interest: 2   Secondary interest: 1   Specific activity: 2
//   Broad goals / working preferences: 1
//
// No answer is preselected. "No preference" / "None of these" options contribute
// zero points for every club. Club names are never used in answer labels.
window.MiuQuizQuestions = (function () {
  'use strict';

  const ALL_CLUBS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  function zeroPoints() {
    const points = {};
    for (const id of ALL_CLUBS) points[id] = 0;
    return points;
  }

  function withPoints(entries) {
    const points = zeroPoints();
    for (const [clubId, value] of Object.entries(entries)) points[clubId] = value;
    return points;
  }

  function explanations(entries) {
    const map = {};
    for (const [clubId, text] of Object.entries(entries)) map[clubId] = text;
    return map;
  }

  const questions = [
    {
      id: 'q1',
      text: "What's your main area of interest right now?",
      weight: 2,
      options: [
        {
          id: 'q1a',
          label: 'Technology, coding, and engineering challenges',
          interestKey: 'tech-coding',
          clubPoints: withPoints({ '6': 3, '5': 3, '9': 2, '1': 1 }),
          explanations: explanations({
            '6': 'You chose coding and engineering challenges — the core of competitive programming and problem-solving.',
            '5': 'You chose coding and engineering challenges — a direct fit for practical engineering and technology projects.',
            '9': 'You chose coding and engineering challenges — relevant to software development and technical projects.',
            '1': 'You chose coding and engineering challenges — connects with creative, real-world problem solving.'
          })
        },
        {
          id: 'q1b',
          label: 'Music, acting, and stage performance',
          interestKey: 'performance',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'You chose music, acting, and stage performance — the heart of acting and stage work.',
            '9': 'You chose music, acting, and stage performance — events and shows need student organizers too.'
          })
        },
        {
          id: 'q1c',
          label: 'Drawing, visual arts, and handmade crafts',
          interestKey: 'visual-arts',
          clubPoints: withPoints({ '4': 2, '1': 1 }),
          explanations: explanations({
            '4': 'You chose drawing, visual arts, and handmade crafts — a fit for media, design, and creative content work.',
            '1': 'You chose drawing, visual arts, and handmade crafts — creative expression feeds innovation projects.'
          })
        },
        {
          id: 'q1d',
          label: 'Sports, fitness, and athletic training',
          interestKey: 'sports',
          clubPoints: withPoints({ '7': 3 }),
          explanations: explanations({
            '7': 'You chose sports, fitness, and athletic training — exactly what movement and sports activities focus on.'
          })
        },
        {
          id: 'q1e',
          label: 'Helping others and community service',
          interestKey: 'community-service',
          clubPoints: withPoints({ '11': 2, '9': 2, '2': 1, '1': 1 }),
          explanations: explanations({
            '11': 'You chose helping others and community service — close to health awareness and medical outreach.',
            '9': 'You chose helping others and community service — student engagement and community initiatives.',
            '2': 'You chose helping others and community service — diplomacy programs include community engagement.',
            '1': 'You chose helping others and community service — creative communities run real-world impact initiatives.'
          })
        },
        {
          id: 'q1f',
          label: 'Business, marketing, and global exchange',
          interestKey: 'business-global',
          clubPoints: withPoints({ '3': 3, '2': 2, '1': 2, '9': 1 }),
          explanations: explanations({
            '3': 'You chose business, marketing, and global exchange — career skills and professional growth.',
            '2': 'You chose business, marketing, and global exchange — diplomacy and international relations.',
            '1': 'You chose business, marketing, and global exchange — leadership and real-world impact.',
            '9': 'You chose business, marketing, and global exchange — campus community and engagement.'
          })
        },
        {
          id: 'q1g',
          label: 'Gaming, anime, and digital leisure',
          interestKey: 'gaming',
          clubPoints: withPoints({ '10': 3 }),
          explanations: explanations({
            '10': 'You chose gaming, anime, and digital leisure — a student gaming community for competitions and connection.'
          })
        },
        {
          id: 'q1h',
          label: 'Trips, travel, and exploring new places',
          interestKey: 'travel',
          clubPoints: withPoints({ '9': 1 }),
          explanations: explanations({
            '9': 'You chose trips, travel, and exploring new places — campus events and gatherings bring people together.'
          })
        },
        {
          id: 'q1i',
          label: 'No preference',
          interestKey: 'none',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q2',
      text: "Is there a second area you'd like to explore?",
      weight: 1,
      options: [
        {
          id: 'q2a',
          label: 'Technology, coding, and engineering challenges',
          interestKey: 'tech-coding',
          clubPoints: withPoints({ '6': 3, '5': 3, '9': 2, '1': 1 }),
          explanations: explanations({
            '6': 'Your second choice of coding challenges supports competitive programming and problem-solving.',
            '5': 'Your second choice of coding challenges supports engineering and technology projects.',
            '9': 'Your second choice of coding challenges supports software development and technical projects.',
            '1': 'Your second choice of coding challenges supports creative problem solving.'
          })
        },
        {
          id: 'q2b',
          label: 'Music, acting, and stage performance',
          interestKey: 'performance',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'Your second choice of performance supports acting and stage work.',
            '9': 'Your second choice of performance supports organizing student events and shows.'
          })
        },
        {
          id: 'q2c',
          label: 'Drawing, visual arts, and handmade crafts',
          interestKey: 'visual-arts',
          clubPoints: withPoints({ '4': 2, '1': 1 }),
          explanations: explanations({
            '4': 'Your second choice of visual arts supports media, design, and creative content work.',
            '1': 'Your second choice of visual arts supports innovation and creative projects.'
          })
        },
        {
          id: 'q2d',
          label: 'Sports, fitness, and athletic training',
          interestKey: 'sports',
          clubPoints: withPoints({ '7': 3 }),
          explanations: explanations({
            '7': 'Your second choice of sports supports movement, fitness, and team activities.'
          })
        },
        {
          id: 'q2e',
          label: 'Helping others and community service',
          interestKey: 'community-service',
          clubPoints: withPoints({ '11': 2, '9': 2, '2': 1, '1': 1 }),
          explanations: explanations({
            '11': 'Your second choice of community service supports health awareness and outreach.',
            '9': 'Your second choice of community service supports student engagement initiatives.',
            '2': 'Your second choice of community service supports diplomacy and community engagement.',
            '1': 'Your second choice of community service supports impact-driven initiatives.'
          })
        },
        {
          id: 'q2f',
          label: 'Business, marketing, and global exchange',
          interestKey: 'business-global',
          clubPoints: withPoints({ '3': 3, '2': 2, '1': 2, '9': 1 }),
          explanations: explanations({
            '3': 'Your second choice of business and global exchange supports career and professional growth.',
            '2': 'Your second choice of business and global exchange supports diplomacy and debate.',
            '1': 'Your second choice of business and global exchange supports leadership initiatives.',
            '9': 'Your second choice of business and global exchange supports campus community work.'
          })
        },
        {
          id: 'q2g',
          label: 'Gaming, anime, and digital leisure',
          interestKey: 'gaming',
          clubPoints: withPoints({ '10': 3 }),
          explanations: explanations({
            '10': 'Your second choice of gaming and digital leisure supports the student gaming community.'
          })
        },
        {
          id: 'q2h',
          label: 'Trips, travel, and exploring new places',
          interestKey: 'travel',
          clubPoints: withPoints({ '9': 1 }),
          explanations: explanations({
            '9': 'Your second choice of travel and exploration supports campus events and gatherings.'
          })
        },
        {
          id: 'q2i',
          label: 'No preference',
          interestKey: 'none',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q3',
      text: "Which technical activity would you prefer?",
      weight: 2,
      options: [
        {
          id: 'q3a',
          label: 'Coding challenges and competitions',
          clubPoints: withPoints({ '6': 3, '5': 2, '9': 1 }),
          explanations: explanations({
            '6': 'You chose coding challenges — the heart of competitive programming and problem-solving.',
            '5': 'You chose coding challenges — relevant to engineering and technology projects.',
            '9': 'You chose coding challenges — useful in software development and technical workshops.'
          })
        },
        {
          id: 'q3b',
          label: 'Software, AI, or cybersecurity projects',
          clubPoints: withPoints({ '9': 3, '6': 2, '5': 2 }),
          explanations: explanations({
            '9': 'You chose software, AI, or cybersecurity projects — a direct match for development and portfolios.',
            '6': 'You chose software, AI, or cybersecurity projects — builds on programming and problem-solving skills.',
            '5': 'You chose software, AI, or cybersecurity projects — connects with practical engineering and technology.'
          })
        },
        {
          id: 'q3c',
          label: 'Practical engineering and hardware projects',
          clubPoints: withPoints({ '5': 3, '6': 2, '9': 1 }),
          explanations: explanations({
            '5': 'You chose practical engineering — the focus of IEEE engineering and technology activities.',
            '6': 'You chose practical engineering — problem-solving through competitive programming.',
            '9': 'You chose practical engineering — technical creation fits student projects and portfolios.'
          })
        },
        {
          id: 'q3d',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q4',
      text: "Which visual art activity would you prefer?",
      weight: 2,
      options: [
        {
          id: 'q4a',
          label: 'Sketching, drawing, and still life',
          clubPoints: withPoints({ '4': 2, '1': 1 }),
          explanations: explanations({
            '4': 'You chose sketching and drawing — a fit for media production and creative expression.',
            '1': 'You chose sketching and drawing — visual expression feeds creative projects.'
          })
        },
        {
          id: 'q4b',
          label: 'Handmade jewellery and craft',
          clubPoints: withPoints({ '4': 2, '1': 1 }),
          explanations: explanations({
            '4': 'You chose handmade jewellery and craft — design, materials, and craftsmanship fit creative content work.',
            '1': 'You chose handmade jewellery and craft — craftsmanship supports creative, hands-on projects.'
          })
        },
        {
          id: 'q4c',
          label: 'Varied art workshops and creative sessions',
          clubPoints: withPoints({ '4': 3, '9': 1 }),
          explanations: explanations({
            '4': 'You chose varied art workshops — a strong match for media, storytelling, and digital content.',
            '9': 'You chose varied art workshops — creativity supports campus community initiatives.'
          })
        },
        {
          id: 'q4d',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q5',
      text: "How would you like to be involved in performance?",
      weight: 2,
      options: [
        {
          id: 'q5a',
          label: 'Music and musical performance',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'You chose music and musical performance — stage performance and expression.',
            '9': 'You chose music and musical performance — student events often feature live music.'
          })
        },
        {
          id: 'q5b',
          label: 'Acting and stage performance',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'You chose acting and stage performance — the core of theatre stage work.',
            '9': 'You chose acting and stage performance — campus shows need organizers and crew.'
          })
        },
        {
          id: 'q5c',
          label: 'Organizing campus events and shows',
          clubPoints: withPoints({ '9': 3, '1': 2, '12': 2 }),
          explanations: explanations({
            '9': 'You chose organizing campus events and shows — student engagement and community events.',
            '1': 'You chose organizing campus events and shows — creative projects and real-world initiatives.',
            '12': 'You chose organizing campus events and shows — TEDx-style campus events and speakers.'
          })
        },
        {
          id: 'q5d',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q6',
      text: "Which community cause matters most to you?",
      weight: 1,
      options: [
        {
          id: 'q6a',
          label: 'Supporting homeless people',
          clubPoints: withPoints({ '11': 2, '9': 1 }),
          explanations: explanations({
            '11': 'You chose supporting homeless people — charity and health-related outreach.',
            '9': 'You chose supporting homeless people — community initiatives and student support.'
          })
        },
        {
          id: 'q6b',
          label: 'General community support and development',
          clubPoints: withPoints({ '9': 3, '1': 1 }),
          explanations: explanations({
            '9': 'You chose general community support — student engagement and community building.',
            '1': 'You chose general community support — community experiences and creative impact.'
          })
        },
        {
          id: 'q6c',
          label: 'Medical outreach and health aid',
          clubPoints: withPoints({ '11': 3 }),
          explanations: explanations({
            '11': 'You chose medical outreach and health aid — health awareness and medical outreach.'
          })
        },
        {
          id: 'q6d',
          label: 'Dental health and awareness',
          clubPoints: withPoints({}),
          explanations: explanations({})
        },
        {
          id: 'q6e',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q7',
      text: "How would you prefer to contribute to health-related causes?",
      weight: 2,
      options: [
        {
          id: 'q7a',
          label: 'Health awareness campaigns',
          clubPoints: withPoints({ '11': 3, '9': 1 }),
          explanations: explanations({
            '11': 'You chose health awareness campaigns — health awareness and education.',
            '9': 'You chose health awareness campaigns — community initiatives and volunteering.'
          })
        },
        {
          id: 'q7b',
          label: 'Medical outreach',
          clubPoints: withPoints({ '11': 3, '9': 1 }),
          explanations: explanations({
            '11': 'You chose medical outreach — direct health outreach and aid.',
            '9': 'You chose medical outreach — volunteering and community support.'
          })
        },
        {
          id: 'q7c',
          label: 'Dental outreach',
          clubPoints: withPoints({}),
          explanations: explanations({})
        },
        {
          id: 'q7d',
          label: 'General volunteering',
          clubPoints: withPoints({ '9': 3, '1': 2, '11': 1 }),
          explanations: explanations({
            '9': 'You chose general volunteering — student engagement and community initiatives.',
            '1': 'You chose general volunteering — creative community projects and impact.',
            '11': 'You chose general volunteering — health awareness and charity work.'
          })
        },
        {
          id: 'q7e',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q8',
      text: "Which business or international activity appeals to you?",
      weight: 1,
      options: [
        {
          id: 'q8a',
          label: 'Business and marketing workshops',
          clubPoints: withPoints({ '3': 3, '1': 2, '9': 1 }),
          explanations: explanations({
            '3': 'You chose business and marketing — career skills and professional growth.',
            '1': 'You chose business and marketing — leadership and real-world problem solving.',
            '9': 'You chose business and marketing — engaging the campus community.'
          })
        },
        {
          id: 'q8b',
          label: 'Diplomacy and global issues',
          clubPoints: withPoints({ '2': 3, '3': 1 }),
          explanations: explanations({
            '2': 'You chose diplomacy and global issues — Model UN and international relations.',
            '3': 'You chose diplomacy and global issues — professional skills and global awareness.'
          })
        },
        {
          id: 'q8c',
          label: 'Cross-cultural exchange and volunteer programs',
          clubPoints: withPoints({ '2': 2, '9': 2, '12': 1 }),
          explanations: explanations({
            '2': 'You chose cross-cultural exchange — diplomacy, debate, and international programs.',
            '9': 'You chose cross-cultural exchange — student community and exchange experiences.',
            '12': 'You chose cross-cultural exchange — campus events with global ideas and speakers.'
          })
        },
        {
          id: 'q8d',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q9',
      text: "Which sports experience would you prefer?",
      weight: 2,
      options: [
        {
          id: 'q9a',
          label: 'Recreational sports and movement',
          clubPoints: withPoints({ '7': 3 }),
          explanations: explanations({
            '7': 'You chose recreational sports — movement, teamwork, and active student life.'
          })
        },
        {
          id: 'q9b',
          label: 'Returning to structured athletic training',
          clubPoints: withPoints({ '7': 3 }),
          explanations: explanations({
            '7': 'You chose returning to structured athletic training — coached sports, strength, and competition.'
          })
        },
        {
          id: 'q9c',
          label: 'Neither',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q10',
      text: "Which leisure experience sounds best to you?",
      weight: 1,
      options: [
        {
          id: 'q10a',
          label: 'Gaming and anime',
          clubPoints: withPoints({ '10': 3 }),
          explanations: explanations({
            '10': 'You chose gaming and anime — competitions and connecting players across campus.'
          })
        },
        {
          id: 'q10b',
          label: 'Trips and exploring places',
          clubPoints: withPoints({ '9': 1 }),
          explanations: explanations({
            '9': 'You chose trips and exploring places — campus gatherings and exploring with fellow students.'
          })
        },
        {
          id: 'q10c',
          label: 'Campus events and student gatherings',
          clubPoints: withPoints({ '9': 3, '1': 2, '12': 2 }),
          explanations: explanations({
            '9': 'You chose campus events and student gatherings — student engagement and community building.',
            '1': 'You chose campus events and student gatherings — creative projects and student initiatives.',
            '12': 'You chose campus events and student gatherings — TEDx-style events and ideas.'
          })
        },
        {
          id: 'q10d',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q11',
      text: "Which team project would you most enjoy?",
      weight: 1,
      options: [
        {
          id: 'q11a',
          label: 'Technical creation, such as software or hardware',
          clubPoints: withPoints({ '9': 3, '6': 2, '5': 2 }),
          explanations: explanations({
            '9': 'You chose technical creation — software development and practical technical projects.',
            '6': 'You chose technical creation — coding challenges and problem-solving.',
            '5': 'You chose technical creation — practical engineering and technology.'
          })
        },
        {
          id: 'q11b',
          label: 'Artistic creation, such as visual art or design',
          clubPoints: withPoints({ '4': 3, '1': 1 }),
          explanations: explanations({
            '4': 'You chose artistic creation — media production, design, and creative content.',
            '1': 'You chose artistic creation — creative projects and visual expression.'
          })
        },
        {
          id: 'q11c',
          label: 'Community initiative, such as charity or outreach',
          clubPoints: withPoints({ '9': 3, '11': 2, '1': 1 }),
          explanations: explanations({
            '9': 'You chose a community initiative — student engagement and community development.',
            '11': 'You chose a community initiative — health awareness, outreach, and charity.',
            '1': 'You chose a community initiative — creative community experiences.'
          })
        },
        {
          id: 'q11d',
          label: 'Organized event, such as shows, conferences, or meetups',
          clubPoints: withPoints({ '12': 3, '9': 3, '1': 2 }),
          explanations: explanations({
            '12': 'You chose organized events — independently hosted campus events and speakers.',
            '9': 'You chose organized events — campus events and student community.',
            '1': 'You chose organized events — creative projects and real-world initiatives.'
          })
        },
        {
          id: 'q11e',
          label: 'Discussion and simulation, such as debate or model assemblies',
          clubPoints: withPoints({ '2': 3, '5': 1 }),
          explanations: explanations({
            '2': 'You chose discussion and simulation — diplomacy, United Nations, and debate.',
            '5': 'You chose discussion and simulation — engineering collaboration and technical learning.'
          })
        },
        {
          id: 'q11f',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q12',
      text: "Which working experience appeals to you most?",
      weight: 1,
      options: [
        {
          id: 'q12a',
          label: 'Solving coding and logic challenges',
          clubPoints: withPoints({ '6': 3, '5': 2, '9': 1 }),
          explanations: explanations({
            '6': 'You chose solving coding challenges — competitive programming and problem-solving.',
            '5': 'You chose solving coding challenges — technology and engineering collaboration.',
            '9': 'You chose solving coding challenges — technical workshops and student projects.'
          })
        },
        {
          id: 'q12b',
          label: 'Practising a craft or performance',
          clubPoints: withPoints({ '8': 3, '4': 2 }),
          explanations: explanations({
            '8': 'You chose practising a craft or performance — acting, expression, and stage work.',
            '4': 'You chose practising a craft or performance — design, materials, and craftsmanship.'
          })
        },
        {
          id: 'q12c',
          label: 'Helping people directly',
          clubPoints: withPoints({ '11': 3, '9': 2 }),
          explanations: explanations({
            '11': 'You chose helping people directly — medical outreach and health awareness.',
            '9': 'You chose helping people directly — community support and student initiatives.'
          })
        },
        {
          id: 'q12d',
          label: 'Coordinating people and plans',
          clubPoints: withPoints({ '9': 3, '12': 2, '1': 2 }),
          explanations: explanations({
            '9': 'You chose coordinating people and plans — organizing campus events and community.',
            '12': 'You chose coordinating people and plans — running TEDx-style campus events.',
            '1': 'You chose coordinating people and plans — leadership and creative initiatives.'
          })
        },
        {
          id: 'q12e',
          label: 'Exploring places and socializing',
          clubPoints: withPoints({ '9': 2, '10': 1, '1': 1 }),
          explanations: explanations({
            '9': 'You chose exploring places and socializing — campus gatherings and student community.',
            '10': 'You chose exploring places and socializing — gaming and social connection.',
            '1': 'You chose exploring places and socializing — creative student initiatives.'
          })
        },
        {
          id: 'q12f',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q13',
      text: "Which skill would you most like to develop?",
      weight: 1,
      options: [
        {
          id: 'q13a',
          label: 'Public speaking and diplomacy',
          clubPoints: withPoints({ '2': 3, '12': 2, '3': 1 }),
          explanations: explanations({
            '2': 'You chose public speaking and diplomacy — Model UN and Arab League simulations.',
            '12': 'You chose public speaking and diplomacy — campus events, talks, and sharing ideas.',
            '3': 'You chose public speaking and diplomacy — career skills and professional growth.'
          })
        },
        {
          id: 'q13b',
          label: 'Problem-solving and programming',
          clubPoints: withPoints({ '6': 3, '5': 2, '9': 1 }),
          explanations: explanations({
            '6': 'You chose problem-solving and programming — competitive programming and coding challenges.',
            '5': 'You chose problem-solving and programming — engineering and technology projects.',
            '9': 'You chose problem-solving and programming — software development and technical work.'
          })
        },
        {
          id: 'q13c',
          label: 'Design and visual expression',
          clubPoints: withPoints({ '4': 3, '1': 1 }),
          explanations: explanations({
            '4': 'You chose design and visual expression — media production and creative content.',
            '1': 'You chose design and visual expression — creative projects and initiatives.'
          })
        },
        {
          id: 'q13d',
          label: 'Health awareness and outreach',
          clubPoints: withPoints({ '11': 3 }),
          explanations: explanations({
            '11': 'You chose health awareness and outreach — health awareness, campaigns, and medical outreach.'
          })
        },
        {
          id: 'q13e',
          label: 'Event organization and leadership',
          clubPoints: withPoints({ '12': 3, '9': 3, '1': 2 }),
          explanations: explanations({
            '12': 'You chose event organization and leadership — campus events and speaker programmes.',
            '9': 'You chose event organization and leadership — campus events and student community.',
            '1': 'You chose event organization and leadership — leadership and real-world impact.'
          })
        },
        {
          id: 'q13f',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q14',
      text: "Which achievement would feel most rewarding?",
      weight: 1,
      options: [
        {
          id: 'q14a',
          label: 'Winning a coding or hackathon competition',
          clubPoints: withPoints({ '6': 3 }),
          explanations: explanations({
            '6': 'You chose winning coding competitions — competitive programming and problem-solving.'
          })
        },
        {
          id: 'q14b',
          label: 'Building and shipping software or hardware',
          clubPoints: withPoints({ '9': 3, '5': 2 }),
          explanations: explanations({
            '9': 'You chose building and shipping software or hardware — software projects and technical portfolios.',
            '5': 'You chose building and shipping software or hardware — practical engineering and technology.'
          })
        },
        {
          id: 'q14c',
          label: 'Performing on stage in front of an audience',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'You chose performing on stage — acting, stage performance, and storytelling.',
            '9': 'You chose performing on stage — campus shows and student events.'
          })
        },
        {
          id: 'q14d',
          label: 'Exhibiting artwork or handmade designs',
          clubPoints: withPoints({ '4': 3, '1': 1 }),
          explanations: explanations({
            '4': 'You chose exhibiting artwork or handmade designs — design, materials, and craftsmanship.',
            '1': 'You chose exhibiting artwork or handmade designs — creative projects and expression.'
          })
        },
        {
          id: 'q14e',
          label: 'Running a successful campus event',
          clubPoints: withPoints({ '12': 3, '9': 3, '1': 2 }),
          explanations: explanations({
            '12': 'You chose running a successful campus event — independently hosted TED-style events.',
            '9': 'You chose running a successful campus event — campus events and student community.',
            '1': 'You chose running a successful campus event — innovation, leadership, and impact.'
          })
        },
        {
          id: 'q14f',
          label: 'Raising awareness for an important cause',
          clubPoints: withPoints({ '11': 3, '9': 1 }),
          explanations: explanations({
            '11': 'You chose raising awareness — health awareness campaigns and education.',
            '9': 'You chose raising awareness — community initiatives and volunteering.'
          })
        },
        {
          id: 'q14g',
          label: 'Providing direct support to a community in need',
          clubPoints: withPoints({ '11': 2, '9': 3 }),
          explanations: explanations({
            '11': 'You chose direct community support — charity, health awareness, and outreach.',
            '9': 'You chose direct community support — student engagement and community development.'
          })
        },
        {
          id: 'q14h',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    },
    {
      id: 'q15',
      text: "Which activity would you most look forward to repeating regularly?",
      weight: 1,
      options: [
        {
          id: 'q15a',
          label: 'Weekly coding practice and challenges',
          clubPoints: withPoints({ '6': 3, '5': 2, '9': 1 }),
          explanations: explanations({
            '6': 'You chose weekly coding practice — competitive programming and problem-solving.',
            '5': 'You chose weekly coding practice — engineering and technology projects.',
            '9': 'You chose weekly coding practice — software development and technical workshops.'
          })
        },
        {
          id: 'q15b',
          label: 'Designing and making things by hand',
          clubPoints: withPoints({ '4': 3, '1': 1 }),
          explanations: explanations({
            '4': 'You chose designing and making things by hand — media production and creative content.',
            '1': 'You chose designing and making things by hand — creative projects and expression.'
          })
        },
        {
          id: 'q15c',
          label: 'Rehearsing and performing regularly',
          clubPoints: withPoints({ '8': 3, '9': 1 }),
          explanations: explanations({
            '8': 'You chose rehearsing and performing — acting, stage performance, and storytelling.',
            '9': 'You chose rehearsing and performing — campus shows and student events.'
          })
        },
        {
          id: 'q15d',
          label: 'Team sports and athletic training',
          clubPoints: withPoints({ '7': 3 }),
          explanations: explanations({
            '7': 'You chose team sports and athletic training — coached sports, strength, and competition.'
          })
        },
        {
          id: 'q15e',
          label: 'Health campaigns and outreach visits',
          clubPoints: withPoints({ '11': 3 }),
          explanations: explanations({
            '11': 'You chose health campaigns and outreach visits — health awareness and medical outreach.'
          })
        },
        {
          id: 'q15f',
          label: 'Organizing meetups and events',
          clubPoints: withPoints({ '12': 3, '9': 3, '1': 2 }),
          explanations: explanations({
            '12': 'You chose organizing meetups and events — campus events and speaker programmes.',
            '9': 'You chose organizing meetups and events — campus events and student community.',
            '1': 'You chose organizing meetups and events — creative projects and initiatives.'
          })
        },
        {
          id: 'q15g',
          label: 'Gaming nights and social hangouts',
          clubPoints: withPoints({ '10': 3 }),
          explanations: explanations({
            '10': 'You chose gaming nights and social hangouts — competitions and connecting players.'
          })
        },
        {
          id: 'q15h',
          label: 'Debating global issues',
          clubPoints: withPoints({ '2': 3 }),
          explanations: explanations({
            '2': 'You chose debating global issues — diplomacy, United Nations, and debate.'
          })
        },
        {
          id: 'q15i',
          label: 'No preference',
          clubPoints: withPoints({}),
          explanations: explanations({})
        }
      ]
    }
  ];

  // Specialist activity questions: specific activity preferences whose direct
  // matches (3 points) count toward activity-based tie-breaking. Generic goal,
  // skill and preference questions are intentionally excluded.
  const specialistQuestionIds = ['q3', 'q4', 'q5', 'q7', 'q9'];

  function question(id) {
    for (const q of questions) if (q.id === id) return q;
    return undefined;
  }

  function option(questionId, optionId) {
    const q = question(questionId);
    if (!q) return undefined;
    for (const o of q.options) if (o.id === optionId) return o;
    return undefined;
  }

  return {
    questions,
    question,
    option,
    specialistQuestionIds,
    weightFor: (id) => {
      const q = question(id);
      return q ? q.weight : 0;
    }
  };
})();
