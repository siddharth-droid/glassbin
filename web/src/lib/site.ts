// Things that are true about the project, in one place, so copy never drifts from reality.

export const REPO_URL = 'https://github.com/siddharth-droid/glassbin'

export interface SampleFile {
  file: string
  /** One line on what the sample is and what it shows. */
  blurb: string
}

// Built by `npm run sample` from this repo's own source, so they're safe to run and to share.
// The first one is what the landing page previews.
export const SAMPLES: SampleFile[] = [
  { file: 'demo-app.exe', blurb: 'harmless, but built to trip the checks' },
  { file: 'glassbin.exe', blurb: "glassbin's own CLI: an ordinary program" },
]

// BASE_URL is "/" locally and "/glassbin/" on GitHub Pages.
export const sampleUrl = (file: string) => `${import.meta.env.BASE_URL}samples/${file}`
