const slides = [];
const W=960,H=540;
const C={red:'C9222A',ink:'101A2A',text:'142033',muted:'536176',soft:'F5F7FA',line:'E0E6EE',blue:'2872D6',green:'18956D',gold:'C58B17',purple:'7255B8',white:'FFFFFF',paleRed:'FFF1F1',pale:'EAF0F7'};
function text(s,v,x,y,w,h,size=18,color=C.text,bold=false,align='l'){s.items.push({type:'text',value:v,x,y,w,h,size,color,bold,align});}
function box(s,x,y,w,h,fill,line='',radius=true){s.items.push({type:'box',x,y,w,h,fill,line,radius});}
function rule(s,x1,y1,x2,y2,color='C4CFDC',width=1.5){s.items.push({type:'line',x1,y1,x2,y2,color,width});}
function card(s,title,body,x,y,w,h,accent=C.red,bodySize=14){box(s,x,y,w,h,C.white,C.line,true);box(s,x+2,y+10,3,h-20,accent,'',false);text(s,title,x+14,y+12,w-32,30,17,C.text,true);text(s,body,x+14,y+46,w-32,h-54,bodySize,C.muted);}
function base(title,subtitle=''){const s={bg:C.soft,items:[]};box(s,0,0,W,7,C.red,'',false);text(s,'MIU STUDENT CLUBS PORTAL  ·  PROJECT OVERVIEW',44,17,872,20,10,C.red,true);text(s,title,44,43,872,42,27,C.ink,true);if(subtitle)text(s,subtitle,44,87,872,27,13,'65738A');rule(s,44,505,916,505,'DEE4EC',1);slides.push(s);return s;}
function grid(title,sub,cards,cols=3){const s=base(title,sub),gap=18,margin=44,top=145,bottom=475,rows=Math.ceil(cards.length/cols),w=(872-gap*(cols-1))/cols,h=Math.min(330,(bottom-top-gap*(rows-1))/rows);cards.forEach((c,i)=>card(s,c[0],c[1],margin+(i%cols)*(w+gap),top+Math.floor(i/cols)*(h+gap),w,h,c[2]||[C.red,C.blue,C.green,C.gold,C.purple][i%5],c[3]||14));return s;}
{
 const s={bg:C.ink,items:[]};box(s,0,0,W,9,C.red,'',false);box(s,678,0,282,H,'17253A','',false);box(s,734,82,160,160,C.white,'',true);s.items.push({type:'pic',x:748,y:112,w:132,h:96});
 text(s,'MIU STUDENT CLUBS PORTAL',64,74,610,24,13,'FFB6B8',true);text(s,'A connected home for\nstudent clubs',64,132,610,120,36,C.white,true);text(s,'Features, roles, approval workflows, analytics, and a roadmap for Misr International University.',64,276,610,78,19,'D4DCE8');rule(s,64,384,390,384,C.red,3);text(s,'Prepared for Misr International University',64,403,610,28,15,C.white,true);text(s,'October 2026  ·  Based on the current portal',64,452,610,24,11,'A8B5C7');text(s,'01',64,504,90,20,10,'A8B5C7');slides.push(s);
}
grid('The idea in one minute','One portal connects student discovery with club operations and university review.',[
 ['Discover','Explore clubs, events, calendars, announcements, sponsors, and booths.'],['Participate','Apply to clubs, register for eligible events, and track activity.'],['Govern','Give each club and reviewer a role-based workspace with clear approval paths.']]);
grid('What the portal includes','Three connected layers serve students, clubs, and the university.',[
 ['Public website','Browse clubs, search and filter, apply, view events and calendar, and explore community posts.'],['Role workspaces','Dedicated dashboards for club leaders, committee heads, PR, English, Security, SSO, Dean, and administrators.'],['Shared services','Accounts, saved student details, workflow records, QR attendance, analytics, and clear system feedback.']]);
grid('Student journey: discover to join','A short path helps students find a club and follow their application.',[
 ['1 · Discover','Search or filter clubs by name, category, and availability.'],['2 · Compare','Review club information, membership capacity, and application status.'],['3 · Apply','Complete the club-specific form using saved profile details where available.'],['4 · Follow up','Return to the account to check the application and next steps.'] ],4);
grid('A public home for campus life','Reviewed public content helps students find what is happening across campus.',[
 ['Events','Event pages can include images, date, time, location, and optional registration.'],['Calendar','Explore events by date and open event details from the calendar.'],['Community feed','See approved university and club announcements in one place.'],['Sponsors & booths','Browse published sponsor and booth information after review.'] ],2);
grid('Student accounts and forms','Accounts make repeat participation easier and keep form submissions connected.',[
 ['Persistent sign-in','Students stay signed in until they choose to sign out, subject to session policy.'],['Saved profile','Previously supplied student details can prefill later forms.'],['Club applications','Club-defined questions capture the information needed for each application.'],['Event registration','Registration appears when enabled by the event publisher; duplicate entries are handled.'] ],2);
grid('Club president and committee workspace','A role-based workspace supports day-to-day club management.',[
 ['Club operations','Manage club details, membership, capacity, and application forms.'],['Content studio','Prepare events, feed posts, sponsors, and booths for the relevant review route.'],['Internal requests','Submit attendance reviews and campus entry permits through their dedicated workflows.']]);
grid('Approval routes and publishing boundaries','Each request follows its own route; only approved public content is published.',[
 ['Public content','Club → PR → English → Dean → published to students. The standard route may vary by configured review rules.'],['Attendance','Club → PR → SSO → Dean. This is an internal club workflow and is not published.'],['Entry permit','Club → PR initial review → Security Office → PR final decision → Dean view-only. Internal only.'] ],3);
grid('Reviewer roles','Reviewers see requests assigned to their department and available actions.',[
 ['PR','Initial review for public content and entry permits; final decision after Security review.'],['English Department','Language review for content intended for the public website.'],['Security Office','Reviews campus entry permit details, then returns the request to PR.'],['SSO','Reviews attendance submissions after PR approval.'],['Dean','Final decision on public content and attendance; view-only for entry permits.'],['Club leaders','Presidents manage operations; committee heads review assigned applications.'],['Global Admin','Manages clubs and reviews portal-level data and analytics.'] ],3);
grid('Global administration','Administration provides a central view of clubs, applications, and activity.',[
 ['Club directory','Manage club records and homepage presence.'],['Applications','Review application totals and status across clubs.'],['Analytics','Explore club performance, event interest, attendance, and student engagement.'],['Website activity','See aggregate visitor and sign-in indicators, with privacy-aware device and network estimates.'] ],2);
grid('Event attendance with QR','A digital check-in path links registration and verified attendance.',[
 ['Before the event','Students register when registration is enabled. Event pages show the relevant details.'],['At the event','Authorized club staff record attendance with the event QR workflow.'],['After the event','Attendance records support club review and university reporting.'],['Review route','Club → PR → SSO → Dean. Attendance requests stay internal.'] ],2);
grid('Analytics for better decisions','Use consistent definitions and database-backed data to understand participation.',[
 ['Club interest','Compare applications, membership, and capacity by club.'],['Event engagement','Track event detail views, registrations, and QR check-ins.'],['Student interest','Understand which clubs and events attract student attention.'],['Operational performance','Review approval queues, turnaround time, and request outcomes.'] ],2);
grid('Trust, privacy, and reliability','Reliable reporting depends on clear sources, permissions, and honest status messages.',[
 ['Database-backed','Show the latest database response; indicate refresh time and report failures.'],['Role permissions','Keep internal requests visible only to authorized roles.'],['Privacy-aware tracking','Use aggregate or pseudonymous identifiers; avoid exposing raw network identifiers.'],['Useful feedback','Explain validation problems, conflicts, file limits, and service errors in plain language.'] ],2);
grid('Capabilities in the current project','These items are represented in the current portal implementation; confirm deployment configuration before launch.',[
 ['Internal workflows','Separate attendance reviews and entry permits from public publishing.'],['University publishing','Support MIU announcements and events with optional registration.'],['Responsive experience','Support mobile layouts, dark mode, loading states, and clearer error pages.'],['Student continuity','Keep account sessions and reusable profile details for form prefill.'] ],2);
{
 const s=base('Portal mind map','One portal, six connected areas, and role-specific workspaces.'),cx=391,cy=228;
 rule(s,410,251,294,183,'C4CFDC',2);rule(s,410,273,294,300,'C4CFDC',2);rule(s,410,298,294,417,'C4CFDC',2);rule(s,550,251,666,183,'C4CFDC',2);rule(s,550,273,666,300,'C4CFDC',2);rule(s,550,298,666,417,'C4CFDC',2);
 box(s,cx,cy,178,82,C.ink,C.red,true);text(s,'MIU CLUBS\nPORTAL',405,247,150,48,19,C.white,true,'ctr');
 card(s,'Public website','Clubs · applications · events\nCalendar · feed · sponsors · booths',44,128,250,103,C.red,11);
 card(s,'Students','Accounts · profile\nApplications · event registration · QR',44,250,250,103,C.blue,11);
 card(s,'Club workspace','President · committee heads\nMembership · forms · operations',44,372,250,103,C.green,11);
 card(s,'Review workflows','Public content: PR → English → Dean\nAttendance: PR → SSO → Dean\nPermit: PR → Security → PR',666,118,250,118,C.red,10);
 card(s,'Role dashboards','Global Admin · PR · English\nSecurity · SSO · Dean · clubs',666,254,250,103,C.purple,11);
 card(s,'Data and analytics','Database-backed records · engagement\nPermissions · privacy · reporting',666,376,250,103,C.gold,11);
 text(s,'Only approved public content is published; attendance and entry permits remain internal.',293,438,373,22,11,C.muted,true,'ctr');
}
grid('Ideas for the next phase','Future opportunities for discussion; these are proposals, not current features.',[
 ['Notifications','Notify students when applications or requests change status.'],['Exportable reports','Download approved analytics as CSV or PDF.'],['Semester filters','Compare activity by term, club, and request type.'],['Calendar reminders','Offer optional personal calendar reminders for events.'],['Student feedback','Collect short post-event satisfaction surveys.'],['Student dashboard','Bring registrations, applications, and reminders into one personal view.'] ],3);
grid('A phased roadmap to discuss','A staged approach can reduce risk and make progress measurable.',[
 ['Phase 1 · Strengthen the core','Validate permissions and workflows; improve mobile usability; document operations.'],['Phase 2 · Improve follow-up','Consider notifications, exportable reports, term filters, and a student dashboard.'],['Phase 3 · Integrate and measure','Evaluate calendar integration and feedback surveys; agree on success measures.'] ],3);
grid('How to measure success','Set a baseline first, then agree on targets with the university and club stakeholders.',[
 ['Reach','Unique visits, club page views, and the share of students reached.'],['Participation','Completed club applications, event registrations, and QR check-ins.'],['Efficiency','Review turnaround time, pending-request age, and resubmission rates.'],['Experience','Mobile completion, error rates, and student and club feedback.'] ],2);
{
 const s={bg:C.ink,items:[]};box(s,0,0,W,9,C.red,'',false);box(s,744,80,150,150,C.white,'',true);s.items.push({type:'pic',x:758,y:110,w:122,h:90});
 text(s,'One portal for a more connected campus-club experience',58,140,650,60,29,C.white,true);text(s,'Easier discovery for students. Clearer operations for clubs.\nMore useful oversight and insight for the university.',58,223,650,68,20,'D4DCE8');text(s,'Discussion points',58,350,650,28,15,'FFB6B8',true);text(s,'• Confirm workflow owners and permissions\n• Select two priorities for the next phase\n• Agree on baseline measures for the academic term',58,390,650,86,15,C.white);text(s,'MIU STUDENT CLUBS PORTAL  ·  2026',58,506,650,18,10,'A8B5C7');slides.push(s);
}
module.exports=slides;
