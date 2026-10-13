# ReDom Mobile Cinematic Showcase

## Implementation

- Screen: `artifacts/redom-frontend/src/screens/CinematicShowcaseScreen.tsx`
- Route: `CinematicShowcase` in `src/routing/types.ts` and `src/routing/AppNavigator.tsx`
- The cinematic welcome runs first on app launch, before `StartupScreen`, for authenticated and unauthenticated sessions alike. It auto-completes after about 16.2 seconds (allowing the three preview cards to cycle), and its Continue to startup / Skip intro controls can finish it sooner.
- Completion transitions directly to the existing `StartupScreen`; its network/security check and user confirmation remain required before the normal navigator appears. Authenticated sessions still proceed to Home Feed, recognized accounts proceed to account selection, and new users proceed to Login after the startup check.
- The scene uses the already-installed `expo-video` package for a muted looping walking clip, React Native `Animated` for layered card movement, and `PanResponder` for optional swipes. No new dependency was added.
- Cards present Sign In, Home Feed, and Mr. Herpes Profile previews modeled on familiar Facebook-style social app screen conventions: a concise login form, stories/composer/feed with Like/Comment/Share actions and bottom navigation, and a cover/avatar/profile header with friend actions and profile tabs. All visible identity is ReDom: the existing ReDom logo and home-feed SVG assets, ReDom blue (`#1877F2`), and ReDom copy replace Facebook branding. These are showcase preview compositions—not copied Facebook assets or screenshots of live authenticated screens—and the real ReDom login, feed, and profile implementations remain unchanged.
- During the intro, the visitor can pause/resume card motion, swipe between cards, select a dot, or skip ahead to the startup security screen. The welcome automatically advances to `StartupScreen` when its intro timer completes.

## Background media

The background walking footage is the Pexels clip [Urban Explorer Walking Through Busy City Street](https://www.pexels.com/video/urban-explorer-walking-through-busy-city-street-36107350/) by Airam Dato-on. Pexels lists the clip as free to use. Source video URL: `https://videos.pexels.com/video-files/36107350/15312311_1920_1080_24fps.mp4`.

Pexels license information: https://www.pexels.com/license/ and https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project

The video is remote rather than bundled so the repository does not gain a large binary. A network connection is required for the live walking footage; the dark visual treatment remains behind the screen if playback is unavailable. Verify actual playback on Android and iOS before release.

## Verification and release checks

- [ ] Mobile typecheck passes.
- [ ] Android build opens and plays the background clip (or gracefully shows the dark fallback).
- [ ] iOS build opens and plays the background clip (or gracefully shows the dark fallback).
- [ ] Auto-advance, pause/resume, swipe direction, and dot selection work.
- [ ] Continue to Login and Create an account navigate to the existing flows.
- [ ] Intro appears before StartupScreen, then automatically transitions to the startup security check after about 16.2 seconds.
- [ ] Continue to startup and Skip intro both advance to StartupScreen without bypassing the security check.
- [ ] Existing recognized-account, login, registration, and authenticated Home Feed routes still work.
- [ ] Confirm reduced-motion/accessibility behavior and performance on a lower-end Android device.
- [ ] Review mobile data use for the remote video. Consider a lower-resolution asset/CDN delivery before broad production rollout.
