# Every solver stage mimics beginner tutorials, not shortest-path search

The app is a teaching tool, so playback must mirror what a learner sees in popular beginner-method tutorials. Each stage is therefore solved the tutorial way — Daisy then Cross case-by-case, first-layer corners via repeated R U R' U' insertion trials, second-layer edges via the left/right insert algorithms, then 2-look OLL and 2-look PLL with the standard published algorithms — even though search-based approaches (e.g. BFS to sub-goals) would produce shorter solutions with less hand-written case-recognition code.

We accept longer solutions (~120–160 moves typical) and a larger hand-coded recognition surface in exchange for output a learner can follow along with. The 10,000-scramble property test (ADR 0001) is the guard against recognition bugs.
