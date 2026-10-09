# ReDom Cartoon—R8.0: Premium Animation Intelligence Specification

## Mission

Build Cartoon—R8.0 as a dedicated, high-quality animation product for original human, animal, creature, and hybrid-character productions. The goal is professional-grade storytelling and animation craft across 2D, 3D, anime-inspired, stylized, painterly, stop-motion-inspired, and hybrid visual approaches—not a claim that ReDom already matches any studio or that every style has passed production acceptance.

## 1. Character performance and animation craft

The generation and planning pipeline should deliberately specify:
- Strong silhouettes, appealing readable designs, stable proportions, anatomy, weight, balance, and clear poses.
- Anticipation, staging, timing, spacing, arcs, follow-through, overlapping motion, secondary action, and controlled squash-and-stretch where stylistically appropriate.
- Consistent character identity across shots: face, eye shape, hair/fur/feathers/scales, body proportions, wardrobe, accessories, markings, colors, age presentation, and distinguishing features.
- Acting that conveys thought and emotion through gaze, facial micro-expression, posture, gesture, breath, pauses, and reactions—not only mouth movement.
- Physically coherent contact, locomotion, impacts, object handling, shadows, reflections, cloth, hair, fur, feathers, tails, ears, and environmental interaction.
- Scene staging, eyelines, screen direction, readable action, shot-to-shot continuity, and intentional camera movement.
- Backgrounds that feel inhabited: wind, foliage, water, weather, particles, crowds, ambient motion, practical light changes, and motivated background activity without distracting from the story.

## 2. Human and animal character intelligence

Humans must retain stable facial identity, plausible anatomy, expressive eyes, natural gestures, believable gait, age-appropriate design, and consistent wardrobe. Avoid uncanny facial drift, extra or fused digits, unstable limbs, rubbery motion outside the chosen style, and expression changes that contradict the dialogue.

Animals must be species-aware, not merely humans wearing animal features. Research and preserve species-appropriate skeletal structure, gait, center of gravity, paw/hoof/wing mechanics, feather or fur behavior, tail/ear posture, sensory behavior, vocalization patterns, and social cues. Anthropomorphic animals may speak and act like characters when requested, but should retain a coherent animal design language. Fantasy creatures need a consistent anatomy and movement rulebook.

## 3. Anime and visual-style direction

When a creator asks for anime or references a genre, mood, period, medium, or visual influence, identify the relevant visual grammar and translate it into a reusable style specification:
- Character design: line weight, shape language, proportions, facial construction, eye rendering, hair grouping, costume detail, palette, and silhouette.
- Animation approach: limited or fluid movement, key-pose emphasis, expressive holds, speed lines, impact frames, smear frames, compositing, and effects density when appropriate.
- Cinematography: lens/framing equivalents, shot duration, camera motion, staging, perspective, depth, and action readability.
- Background art: painted, graphic, architectural, naturalistic, atmospheric, or highly designed environments.
- Lighting and color scripts: scene-specific palettes and changes tied to emotional beats.
- Dialogue acting, mouth shapes, timing, subtitles, and localized text.
- Genre grammar: for example, romance emphasizes eye-lines, pauses, gestures, and emotional close-ups; action emphasizes readable silhouettes and cause-and-effect; horror uses negative space, controlled reveals, and tension; comedy uses timing and reaction; fantasy uses coherent visual motifs and environmental scale.

Use specific anime or animation works as research references only to understand high-level, observable techniques and context. Prefer primary/official sources, interviews, production notes, museum/academic sources, and reputable publications. The system should explain why a visual approach fits the creator's premise and may recommend several options with tradeoffs. Do not copy existing characters, exact costumes, logos, signature compositions, scripts, frames, or other protected expression. Produce original characters and a distinct visual identity rather than a near-duplicate of a named franchise or studio film.

## 4. Internet research and source grounding

Research should be purposeful and scoped to the creator's request:
1. Identify the requested genre, audience, format, target language, era, cultural setting, and visual references.
2. Search reliable public sources for factual details such as animal behavior, anatomy, clothing, architecture, historical setting, language, pronunciation, musical instruments, or broad animation-production techniques.
3. Store concise findings, source title/URL, source type, date where available, and which design decision the finding supports.
4. Separate verifiable facts from creative invention. Never treat fan speculation as fact or copy scripts, panels, shot sequences, or plot expression from protected works.
5. If web research is unavailable, state uncertainty internally and use conservative, clearly fictional choices rather than fabricating facts.
6. Do not let research delay every simple request; use depth proportional to the request and offer a research-backed style brief for ambitious productions.

## 5. Language, voice, and speaking performance

Language is part of character identity and story direction:
- Preserve the creator's requested language and script; support multilingual dialogue and intentional code-switching when requested.
- Track character-specific language, dialect/locale, vocabulary, formality, rhythm, pace, pitch range, timbre, emotional delivery, breath, pauses, and pronunciation notes.
- Use native-language review or reliable linguistic references for culturally or linguistically sensitive dialogue when available. Avoid caricatured accents.
- Match spoken line duration to the shot; account for syllable timing, mouth shapes/visemes, jaw motion, and emotional facial acting.
- Keep voice identity consistent across scenes and episodes. A singing voice should not automatically be assumed to match the speaking voice.
- Provide localized subtitles/captions as requested, preserve speaker attribution, and avoid inventing audio generation or lip-sync completion when the corresponding pipeline has not confirmed it.
- Voice, dialogue, sound effects, ambience, and score must be mixed intentionally, with intelligibility and scene-appropriate dynamics.

## 6. Production pipeline and quality gates

Plan before rendering. Use a style bible, character sheets, turnarounds, expression sheets, pose/action references, environment sheets, color scripts, storyboards, animatics, shot lists, dialogue/voice sheets, and continuity metadata as appropriate to project scale.

Before final composition, validate:
- Character and environment consistency across shots.
- Anatomy, motion, contact, and physics within the chosen style.
- Dialogue language, speaker identity, pronunciation, timing, subtitles, and lip-sync where generated.
- Flicker, temporal instability, morphing, duplicated or missing limbs, texture crawl, inconsistent markings, and abrupt style changes.
- Scene continuity, shot transitions, audio sync, loudness, subtitle legibility, and final render integrity.
- Whether all claimed output features are actually present in the generated assets.

Failed checks should trigger a targeted retry or explicit warning, not a false claim of perfection. Keep a human-review path for premium productions and collect opt-in creator feedback for quality evaluation.

## 7. Model identity and truthful readiness

Cartoon—R8.0 is the product identity for the cartoon/animation workflow. A catalogue entry or runtime name alone does not prove that a separate trained checkpoint, independent service, GPU capacity, healthy endpoint, or production-grade output exists. The backend must report configuration and health separately, and product claims must follow observed capability and acceptance-test evidence.

The cartoon product must not silently fall back to a different model while claiming Cartoon—R8.0 performed the generation. If no compatible runtime is available, return an explicit unavailable/not-configured result.

## 8. Acceptance tests required before premium claims

Build a repeatable test set covering:
- Human close-up dialogue, full-body locomotion, two-character interaction, group scenes, emotional acting, and consistent wardrobe.
- Multiple animal species walking, running, turning, jumping, flying/swimming where appropriate, interacting with props, and displaying species-appropriate behavior.
- Original anime-inspired action, romance, comedy, suspense, fantasy, and quiet dialogue scenes.
- At least two requested languages with appropriate script, voice assignment, timing, captions, and verified lip-sync where supported.
- Multi-shot character identity and background continuity.
- Camera moves, complex lighting, rain/water, hair/fur/cloth, and moving backgrounds.
- Research-grounded settings with traceable sources and clearly separated fictional additions.
- Adversarial prompts asking for exact copies of named copyrighted characters or scenes; the system should redirect to an original design using high-level attributes.
- Load, timeout, retry, cancellation, moderation, and failed-render handling.

Report measured results by test category and model/runtime version. Do not label the product “Disney-level,” “indistinguishable from human-made,” or “perfect” without defensible evaluation evidence.

## Public animation-craft references

- Disney Animation, Animation: https://www.disneyanimation.com/process/animation/
- Disney Animation, Story: https://www.disneyanimation.com/process/story/
- Disney Animation, Lighting: https://www.disneyanimation.com/process/lighting/
- Agency for Cultural Affairs, Japan Media Arts Festival, Studio TRIGGER profile: https://www.bunka.go.jp/j-mediaarts/en/animation/FeaturingStudios/TRIGGER.html

These sources inform high-level craft principles. They do not authorize copying protected characters, scenes, or exact visual expression.
