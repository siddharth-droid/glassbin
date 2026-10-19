import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { useGSAP } from '@gsap/react'

// Scrolling itself is native — no smooth-scroll library. In-page links glide via CSS
// `scroll-behavior`, which reduced-motion users get as an instant jump (see styles.css).
gsap.registerPlugin(useGSAP, ScrollTrigger, ScrambleTextPlugin)

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export { gsap, ScrollTrigger, useGSAP }
