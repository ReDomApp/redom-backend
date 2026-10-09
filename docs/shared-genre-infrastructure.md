# ReDom shared genre infrastructure

ReDom's Video, Cartoon, and Studio products are shared generation infrastructure, not cinema-only systems. The same routing, orchestration, storage, callback, security, and media-validation foundations must support any creator-selected genre and deliberate combinations of genres.

## Supported genre taxonomy

The initial discoverable genre set includes romance, love story, horror, psychological thriller, action, comedy, drama, crime, mystery, adventure, science fiction, fantasy, historical, documentary, family animation, and multi-genre. This list is extensible, not an allowlist; a creator may request other coherent genres.

## Behavior contract

- Preserve the creator's explicit genre and tone. Infer them from the prompt only when not stated.
- Do not default every prompt to Hollywood cinema, action, or a generic dramatic tone.
- Match pacing, framing, lighting, color, camera motion, soundscape, character behavior, dialogue, and ending to the requested genre.
- For blends, keep each requested genre materially present; do not let one silently override the others.
- Romance and love stories should develop believable chemistry, consent, relationship dynamics, and emotional consequences.
- Horror should build atmosphere, suspense, dread, and coherent scares rather than adding random violence.
- Action should use readable choreography, spatial continuity, and cause-and-effect.
- Comedy should preserve timing, setups, callbacks, and payoffs.
- Animation can use any genre; cartoon is a visual/rendering format, not a genre.
- Language and cultural context are independent of genre. Honor the requested language and setting without silently translating or flattening culturally specific details.
- Preserve the existing safety, consent, rights, and output-validation requirements. Genre support is not permission to create disallowed content.

## Product boundaries

- **ReDom-v2.8—Video**: short-form video generation across genres.
- **Cartoon—R8.0**: animation/cartoon rendering across genres; cartoon describes presentation, not story genre.
- **Studio—Ultron 8.0R**: long-form planning and production across genres, including episodes, series, trailers, shorts, and feature-style projects. It may use video or cartoon shot rendering according to the selected production format.

The genre taxonomy is a shared capability contract. It does not claim that all listed genres already pass GPU quality acceptance. Each runtime and genre/style combination must be tested with actual rendered media before quality claims are made.
