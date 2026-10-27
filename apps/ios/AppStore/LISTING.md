# App Store listing (#177)

Ready to paste into App Store Connect → Stubbed → Distribution. English (UK) is the primary language; it covers other English storefronts too. Character limits are Apple's.

Public copy rule (root `CLAUDE.md`): no launch cities or regions, so no "Broadway" or "West End" here, in the keywords either.

## App information

| Field | Value |
|---|---|
| Name (30) | Stubbed: Theatre Diary |
| Subtitle (30) | Log, rate and share your shows |
| Category | Primary: Lifestyle. Secondary: Entertainment |
| Age rating | 12+ (user-generated content with reporting and blocking; answer "Infrequent/Mild" for nothing, "No" for everything else, and Yes to "user-generated content") |
| Privacy Policy URL | https://getstubbed.app/privacy |
| Support URL | https://getstubbed.app/faq (support email on it: support@getstubbed.app) |
| Marketing URL | https://getstubbed.app |
| Copyright | 2026 Felix Ng |
| Price | Free, no in-app purchases |

## Promotional text (170)

> Your theatre diary, finally in one place. Log a show in seconds after the curtain call, rate it, and share a card your friends will actually want to see.

## Description (4000)

> Stubbed is a theatre diary for people who love live theatre. Musicals, plays, opera, dance, comedy: every show you see, in one place.
>
> LOG A SHOW IN SECONDS
> Add a show right after the curtain call. Start with a photo from the night and Stubbed fills in the date, finds the theatre you were at and suggests the show. Rate it in half stars and add a note if you like.
>
> TRIPS AND FESTIVALS
> Group shows into trips: a week of theatre on holiday, a festival run, a birthday weekend. See how many shows, venues and nights each one held.
>
> SHARE CARDS WORTH POSTING
> Every show and trip has a good-looking card, sized for Instagram Stories, with your rating, the theatre and your handle.
>
> YOUR PROFILE AND FEED
> Your profile shows the theatres you've been to and your theatregoing calendar. Follow friends to see their shows in your feed, like them and comment. Make your profile private and approve each follower, or keep any single show private.
>
> ANY THEATRE, ANYWHERE
> If a show or venue isn't listed yet, add it as you go.
>
> YOUR DATA IS YOURS
> Photos have their location data removed before upload. Report and block are always one tap away. Delete your account and everything in it from Settings at any time.
>
> Stubbed is free.

## Keywords (100)

```
theatre,theater,musical,musicals,play,show,diary,log,tracker,review,rating,stage,opera,ticket,stub
```

(98 characters. No spaces after commas, and no words already in the name or subtitle beyond "theatre", which helps the US spelling pair.)

## What's new in this version

> The first release of Stubbed. Log your shows, group them into trips and share your cards.

## Screenshots

`screenshots/` holds the 6.9" set (1320×2868, the size App Store Connect now requires; it scales them down for smaller iPhones), in this order:

1. `01-hero.jpg`: the Home feed, photo first
2. `02-history.jpg`: the diary on Profile
3. `03-log.jpg`: logging a show
4. `04-share.jpg`: the share card
5. `05-plan.jpg`: a trip

Suggested captions if you add text overlays later: "Every show you've seen", "Your theatre diary", "Log a show in seconds", "Share a card worth posting", "Trips and festivals".

To retake them: put the eight marketing photos in `build/marketing-photos/` (git-ignored), then from `apps/ios` run `SIM="iPhone 17 Pro Max" scripts/dev marketing` and convert `build/marketing/*.png` with `sips -s format jpeg -s formatOptions 90`.

## App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes |
| Demo account | `review@getstubbed.app` / (set a password in Supabase → Authentication → Users, with a handle and a few public shows, and paste it here in App Store Connect only, never in this repo) |
| Contact | Felix Ng, support@getstubbed.app |

Notes for the reviewer:

> Stubbed is a theatre diary. Sign in with the demo account above, or create your own account with Sign in with Apple or email.
>
> User-generated content (guideline 1.2): long-press any show or comment from another person and choose Report, or open their profile and use the ⋯ menu to Report or Block. Blocking hides both people's content from each other at once. Reports go to our moderation queue, which we review daily. Blocked accounts can be managed in Profile → Edit profile → Blocked accounts.
>
> Account deletion (5.1.1(v)): Profile → Edit profile → Delete account.
>
> Photos: the app asks for photo library access only when you add a photo to a show; location data is removed before upload. The app uses only standard HTTPS encryption.

## App Privacy

Filled in separately (#154).
