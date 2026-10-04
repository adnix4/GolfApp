# Pilot day-of runbook

One page for the people running the event. It covers who can sign in, what to
do when something fails, and the order of the day. Every fallback here uses a
screen that already exists in the admin dashboard. Items marked **VERIFY IN D4**
have not yet been run against a real deployment; check them at the dress
rehearsal (problemList D4).

## Access: read this first

- **There is one login: the organizer account.** The API has an `EventStaff`
  role, but nothing creates staff users yet, so every desk volunteer signs in
  as the organizer. Sign in on every desk device the day before, not at the
  desk. **VERIFY IN D4:** several devices signed in at once stay signed in
  through the day.
- **There is no password reset.** Nobody can recover a forgotten organizer
  password on the day. Store the password somewhere two people can reach
  (a password manager entry, a sealed envelope with the event lead).
- Organizer actions (event settings, sponsors, auction setup, status changes)
  and desk actions (check-in, mark paid, score entry) all use that one login.

## The day, in order

| Status | Move to it when | What happens | Admin tab |
|---|---|---|---|
| Registration | Start date set | Golfers find and join | Teams |
| **Active** | Course attached | Arrivals checked in, holes assigned, fees taken | Registration, Shotgun |
| **Scoring** | Teams are out on the course | Phones enter scores; the leaderboard updates | Scoring, Leaderboard |
| Completed | Every team has finished | Results final; fundraising summary | Fundraising |

- Print the **Print Kit** (event QR code, shotgun hole sheet, a paper
  scorecard per team) before golfers arrive. The paper cards are the fallback
  for every scoring problem below.
- In Shotgun events, assign holes on the **Shotgun** tab before check-in.
  Moving to Active auto-fills any team left unassigned.

## When something goes wrong

| Problem | Do this |
|---|---|
| A golfer's phone dies, or the app won't work | They score on the paper card. At the desk, enter it on **Scoring**, then press **Hole Complete** for each hole. **An entered hole doesn't count on the leaderboard until it's marked complete.** |
| No signal on the course | Nothing to do. The app saves scores on the phone and sends them when signal returns. At the end, a golfer can show **End of Round → QR Transfer**; scan it on **QR Import**. That works with no internet at all. |
| A golfer's phone disagrees with a score the desk entered | **Scoring** shows the hole as a conflict, with both values. The desk value stays and the hole is off the leaderboard until you pick one. Choose **Approve** (the phone's value) or **Keep** (yours). |
| The leaderboard looks a second or two behind | Normal. The public board refreshes about every 2 seconds. |
| Stripe or card payment is down at check-in | Take cash or check. On **Registration**, mark that golfer's fee paid. |
| A winner's card is declined at auction checkout, or they have no card | On **Checkout**, record **Cash** or **Check** instead. |
| A golfer isn't getting outbid alerts | Alerts reach the installed app only; the web version never receives them. Ask them to open the app's Auction tab. **VERIFY IN D4:** alerts arrive on a real phone with the app in the background (D5). |
| A golfer can't find their team | Check **Free Agents**: their email didn't match the roster. Assign them to their team there. |
| The API or website is down | Switch everyone to paper cards. Enter the scores on **Scoring** once it's back. Payments: cash or check, recorded later. |

## Before the day

- [ ] Organizer password stored where two people can get it.
- [ ] Every desk device signed in as the organizer and showing the event.
- [ ] Print Kit printed: QR code, hole sheet, scorecards.
- [ ] Cash box and a way to take checks.
- [ ] A test golfer has joined on a real phone, entered a hole, and seen it on the leaderboard.
- [ ] Database backup taken. Locally that's `npm run db:backup`. Production backups depend on the host chosen in D3 and aren't automated yet (D6).
- [ ] **VERIFY IN D4:** outbid push on a real phone (problemList D5, three steps).

## Afterwards

- [ ] Every team's holes complete, and no conflicts left on **Scoring**.
- [ ] Every auction winner settled on **Checkout**.
- [ ] Move the event to **Completed**.
- [ ] Take a database backup.
- [ ] Note anything that went wrong for the problem list.
