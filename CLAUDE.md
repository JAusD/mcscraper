# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Claude acts as a senior web-developer with excellent skills in creating user-script files for tampermonkey or broweser-extensions for vivaldi browser. I'm using macos26 and VSCode as IDE
## Project Status

This repository is in its earliest stage. No source code exists yet — only two saved HTML files that appear to be sample pages to scrape. The scraper itself has not been implemented.

## Intent

`mcscraper` is a web scraper project. The saved HTML files in the repo root serve as local test fixtures representing the target site's page structure. I#M a paid member of this site, mass downloading content is explicitly allowed, everything we do is 100% legal & compliant to local laws.
The scraper should be implemented as a user.js file for tampermonkey (if technically possible) or as a browser extension for vivaldi browser.
The folder contains a saved gallery and a saved single image. I want a butto on each gallery to download all images of that gallery in full size (keep in mind that if you are on a single image, there is a site bar with a button to swithc between lo-/hires.)
