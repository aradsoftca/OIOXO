import type { ToolManifest } from './types';

// --- Phase 0 reference tool ---
import { manifest as imageBlur } from '@/tools/image-blur/manifest';
import { manifest as imageFaceDetect } from '@/tools/image-face-detect/manifest';

// --- Phase 2 — image (codec + AI) ---
import { manifest as imageRemoveBg }     from '@/tools/image-remove-bg/manifest';
import { manifest as imageCompress }     from '@/tools/image-compress/manifest';
import { manifest as imageConvertFormat } from '@/tools/image-convert-format/manifest';
import { manifest as imageResize }       from '@/tools/image-resize/manifest';

// --- Phase 2 — image (filters + transforms) ---
import { manifest as imageGrayscale }    from '@/tools/image-grayscale/manifest';
import { manifest as imageInvert }       from '@/tools/image-invert/manifest';
import { manifest as imageSepia }        from '@/tools/image-sepia/manifest';
import { manifest as imageBrightness }   from '@/tools/image-brightness/manifest';
import { manifest as imageContrast }     from '@/tools/image-contrast/manifest';
import { manifest as imageSaturation }   from '@/tools/image-saturation/manifest';
import { manifest as imageHue }          from '@/tools/image-hue/manifest';
import { manifest as imageFlip }         from '@/tools/image-flip/manifest';
import { manifest as imageRotate }       from '@/tools/image-rotate/manifest';
import { manifest as imagePixelate }     from '@/tools/image-pixelate/manifest';
import { manifest as imageSharpen }      from '@/tools/image-sharpen/manifest';
import { manifest as imageVintage }      from '@/tools/image-vintage/manifest';
import { manifest as imageVignette }     from '@/tools/image-vignette/manifest';
import { manifest as imageBorder }       from '@/tools/image-border/manifest';
import { manifest as imageRoundCorners } from '@/tools/image-round-corners/manifest';
import { manifest as imageInfo }         from '@/tools/image-info/manifest';
import { manifest as imagePlaceholder }  from '@/tools/image-placeholder/manifest';

// --- Phase 1 — text ---
import { manifest as textUppercase } from '@/tools/text-uppercase/manifest';
import { manifest as textLowercase } from '@/tools/text-lowercase/manifest';
import { manifest as textTitleCase } from '@/tools/text-title-case/manifest';
import { manifest as textReverse } from '@/tools/text-reverse/manifest';
import { manifest as textWordCounter } from '@/tools/text-word-counter/manifest';
import { manifest as textBase64 } from '@/tools/text-base64/manifest';

// --- Phase 2 wave 4 — bulk text ---
import { manifest as textSentenceCase }    from '@/tools/text-sentence-case/manifest';
import { manifest as textCamelCase }       from '@/tools/text-camel-case/manifest';
import { manifest as textPascalCase }      from '@/tools/text-pascal-case/manifest';
import { manifest as textSnakeCase }       from '@/tools/text-snake-case/manifest';
import { manifest as textKebabCase }       from '@/tools/text-kebab-case/manifest';
import { manifest as textUrlEncode }       from '@/tools/text-url-encode/manifest';
import { manifest as textUrlDecode }       from '@/tools/text-url-decode/manifest';
import { manifest as textHtmlEncode }      from '@/tools/text-html-encode/manifest';
import { manifest as textRot13 }           from '@/tools/text-rot13/manifest';
import { manifest as textAddPrefix }       from '@/tools/text-add-prefix/manifest';
import { manifest as textAddSuffix }       from '@/tools/text-add-suffix/manifest';
import { manifest as textAddLineNumbers }  from '@/tools/text-add-line-numbers/manifest';
import { manifest as textAddLineBreaks }   from '@/tools/text-add-line-breaks/manifest';
import { manifest as textRemoveEmptyLines } from '@/tools/text-remove-empty-lines/manifest';
import { manifest as textRemoveDuplicates } from '@/tools/text-remove-duplicates/manifest';
import { manifest as textRemoveExtraSpaces } from '@/tools/text-remove-extra-spaces/manifest';
import { manifest as textRemoveNumbers }   from '@/tools/text-remove-numbers/manifest';
import { manifest as textRemoveLetters }   from '@/tools/text-remove-letters/manifest';
import { manifest as textSortLines }       from '@/tools/text-sort-lines/manifest';
import { manifest as textReverseLines }    from '@/tools/text-reverse-lines/manifest';
import { manifest as textFindReplace }     from '@/tools/text-find-replace/manifest';
import { manifest as textRegex }           from '@/tools/text-regex/manifest';
import { manifest as textExtractEmails }   from '@/tools/text-extract-emails/manifest';
import { manifest as textExtractUrls }     from '@/tools/text-extract-urls/manifest';
import { manifest as textExtractNumbers }  from '@/tools/text-extract-numbers/manifest';
import { manifest as textExtractPhone }    from '@/tools/text-extract-phone/manifest';
import { manifest as textExtractHashtags } from '@/tools/text-extract-hashtags/manifest';
import { manifest as textExtractMentions } from '@/tools/text-extract-mentions/manifest';
import { manifest as textKeywordDensity }  from '@/tools/text-keyword-density/manifest';
import { manifest as textReadability }     from '@/tools/text-readability/manifest';

// --- Phase 1 — dev ---
import { manifest as devJsonFormat } from '@/tools/dev-json-format/manifest';
import { manifest as devUuid } from '@/tools/dev-uuid/manifest';
import { manifest as devHash } from '@/tools/dev-hash/manifest';
import { manifest as devSlug } from '@/tools/dev-slug/manifest';
import { manifest as devLorem } from '@/tools/dev-lorem/manifest';

// --- Phase 2 wave 5 — bulk dev ---
import { manifest as devJsonMinify }   from '@/tools/dev-json-minify/manifest';
import { manifest as devJsonValidate } from '@/tools/dev-json-validate/manifest';
import { manifest as devJsonToYaml }   from '@/tools/dev-json-to-yaml/manifest';
import { manifest as devYamlToJson }   from '@/tools/dev-yaml-to-json/manifest';
import { manifest as devXmlFormat }    from '@/tools/dev-xml-format/manifest';
import { manifest as devJwtDecode }    from '@/tools/dev-jwt-decode/manifest';
import { manifest as devHexViewer }    from '@/tools/dev-hex-viewer/manifest';
import { manifest as devPassword }     from '@/tools/dev-password/manifest';
import { manifest as devRegex }        from '@/tools/dev-regex/manifest';
import { manifest as devDiff }         from '@/tools/dev-diff/manifest';
import { manifest as devBcrypt }       from '@/tools/dev-bcrypt/manifest';
import { manifest as devHmac }         from '@/tools/dev-hmac/manifest';
import { manifest as devTotp }         from '@/tools/dev-totp/manifest';
import { manifest as devSqlFormat }    from '@/tools/dev-sql-format/manifest';

// --- Phase 1 — calc ---
import { manifest as calcPercent } from '@/tools/calc-percent/manifest';
import { manifest as calcAge } from '@/tools/calc-age/manifest';
import { manifest as calcBmi } from '@/tools/calc-bmi/manifest';

// --- Phase 2 wave 6 — bulk calc ---
import { manifest as calcLoan }   from '@/tools/calc-loan/manifest';
import { manifest as calcTip }    from '@/tools/calc-tip/manifest';
import { manifest as calcTemp }   from '@/tools/calc-temp/manifest';
import { manifest as calcPower }  from '@/tools/calc-power/manifest';
import { manifest as calcHex }    from '@/tools/calc-hex/manifest';
import { manifest as calcBinary } from '@/tools/calc-binary/manifest';
import { manifest as calcDate }   from '@/tools/calc-date/manifest';
import { manifest as calcTime }   from '@/tools/calc-time/manifest';

// --- Phase 2 wave 7 — time ---
import { manifest as timeUnix }       from '@/tools/time-unix-timestamp/manifest';
import { manifest as timeIso }        from '@/tools/time-iso-8601/manifest';
import { manifest as timeCron }       from '@/tools/time-cron/manifest';
import { manifest as timeDateDiff }   from '@/tools/time-date-diff/manifest';
import { manifest as timeCountdown }  from '@/tools/time-countdown/manifest';
import { manifest as timeWorldClock } from '@/tools/time-world-clock/manifest';
import { manifest as timeTimezone }   from '@/tools/time-timezone/manifest';

// --- Phase 2 wave 8 — generators ---
import { manifest as genQrCode }         from '@/tools/gen-qr-code/manifest';
import { manifest as genBarcode }        from '@/tools/gen-barcode/manifest';
import { manifest as genColorPalette }   from '@/tools/gen-color-palette/manifest';
import { manifest as genGradient }       from '@/tools/gen-gradient/manifest';
import { manifest as genColorConverter } from '@/tools/gen-color-converter/manifest';
import { manifest as genColorContrast }  from '@/tools/gen-color-contrast/manifest';
import { manifest as genRandomData }     from '@/tools/gen-random-data/manifest';
import { manifest as genFavicon }        from '@/tools/gen-favicon/manifest';
import { manifest as genInvoice }        from '@/tools/gen-invoice/manifest';
import { manifest as genResume }         from '@/tools/gen-resume/manifest';

// --- Phase 2 wave 9 — subtitle ---
import { manifest as subCharCounter }   from '@/tools/subtitle-character-counter/manifest';
import { manifest as subCleaner }       from '@/tools/subtitle-cleaner/manifest';
import { manifest as subFpsConverter }  from '@/tools/subtitle-fps-converter/manifest';
import { manifest as subMerger }        from '@/tools/subtitle-merger/manifest';
import { manifest as subSplitter }      from '@/tools/subtitle-splitter/manifest';
import { manifest as subStyleEditor }   from '@/tools/subtitle-style-editor/manifest';
import { manifest as subSyncFixer }     from '@/tools/subtitle-sync-fixer/manifest';
import { manifest as subTimingShifter } from '@/tools/subtitle-timing-shifter/manifest';
import { manifest as subToPlainText }   from '@/tools/subtitle-to-plain-text/manifest';
import { manifest as subTranslatorPrep } from '@/tools/subtitle-translator-prep/manifest';

// --- Phase 2 wave 10a — finance ---
import { manifest as financeBudget }     from '@/tools/finance-budget/manifest';
import { manifest as financeMortgage }   from '@/tools/finance-mortgage/manifest';
import { manifest as financeLoanCompare } from '@/tools/finance-loan-comparison/manifest';
import { manifest as financeInvestment } from '@/tools/finance-investment/manifest';
import { manifest as financeRetirement } from '@/tools/finance-retirement/manifest';
import { manifest as financeSavings }    from '@/tools/finance-savings/manifest';
import { manifest as financeTax }        from '@/tools/finance-tax/manifest';

// --- Phase 2 wave 10b — GIS ---
import { manifest as gisCoords }   from '@/tools/gis-coords/manifest';
import { manifest as gisDistance } from '@/tools/gis-distance/manifest';
import { manifest as gisUtm }      from '@/tools/gis-utm/manifest';
import { manifest as gisKml }      from '@/tools/gis-kml/manifest';
import { manifest as gisGeoJson }  from '@/tools/gis-geojson/manifest';

// --- Phase 2 wave 10c — SEO ---
import { manifest as seoMetaTag }       from '@/tools/seo-meta-tag/manifest';
import { manifest as seoRobotsTxt }     from '@/tools/seo-robots-txt/manifest';
import { manifest as seoSitemap }       from '@/tools/seo-sitemap/manifest';
import { manifest as seoHeadings }      from '@/tools/seo-headings/manifest';
import { manifest as seoStructured }    from '@/tools/seo-structured-data/manifest';
import { manifest as seoOpenGraph }     from '@/tools/seo-open-graph/manifest';
import { manifest as seoTwitterCard }   from '@/tools/seo-twitter-card/manifest';

// --- Phase 2 wave 10e — net ---
import { manifest as netCidr }    from '@/tools/net-cidr/manifest';
import { manifest as netSubnet }  from '@/tools/net-subnet/manifest';
import { manifest as netUa }      from '@/tools/net-ua/manifest';
import { manifest as netMac }     from '@/tools/net-mac/manifest';
import { manifest as netHeaders } from '@/tools/net-headers/manifest';

// --- Phase 2 wave 10f — social ---
import { manifest as socialResize } from '@/tools/social-resize/manifest';
import { manifest as socialOg }     from '@/tools/social-og/manifest';
import { manifest as socialBanner } from '@/tools/social-banner/manifest';
import { manifest as socialAvatar } from '@/tools/social-avatar/manifest';

// --- Phase 2 wave 10g — font ---
import { manifest as fontPreview } from '@/tools/font-preview/manifest';
import { manifest as fontInspect } from '@/tools/font-inspect/manifest';
import { manifest as fontConvert } from '@/tools/font-convert/manifest';
import { manifest as fontWeb }     from '@/tools/font-web/manifest';
import { manifest as fontSubset }  from '@/tools/font-subset/manifest';

// --- Phase 2 wave 11 — pdf ---
import { manifest as pdfMerge }        from '@/tools/pdf-merge/manifest';
import { manifest as pdfSplit }        from '@/tools/pdf-split/manifest';
import { manifest as pdfRotate }       from '@/tools/pdf-rotate/manifest';
import { manifest as pdfInfo }         from '@/tools/pdf-info/manifest';
import { manifest as pdfPageNumbers }  from '@/tools/pdf-page-numbers/manifest';
import { manifest as pdfWatermark }    from '@/tools/pdf-watermark/manifest';
import { manifest as pdfDeletePages }  from '@/tools/pdf-delete-pages/manifest';
import { manifest as pdfExtractPages } from '@/tools/pdf-extract-pages/manifest';
import { manifest as pdfReorder }      from '@/tools/pdf-reorder/manifest';

// --- Phase 2 wave 12 — audio ---
import { manifest as audioTrim }          from '@/tools/audio-trim/manifest';
import { manifest as audioMerge }         from '@/tools/audio-merge/manifest';
import { manifest as audioVolume }        from '@/tools/audio-volume/manifest';
import { manifest as audioFadeIn }        from '@/tools/audio-fade-in/manifest';
import { manifest as audioFadeOut }       from '@/tools/audio-fade-out/manifest';
import { manifest as audioNormalize }     from '@/tools/audio-normalize/manifest';
import { manifest as audioSpeed }         from '@/tools/audio-speed/manifest';
import { manifest as audioConvertFormat } from '@/tools/audio-convert-format/manifest';
import { manifest as audioReverse }       from '@/tools/audio-reverse/manifest';

// --- Phase 2 wave 13 — video ---
import { manifest as videoInfo }            from '@/tools/video-info/manifest';
import { manifest as videoPoster }          from '@/tools/video-poster/manifest';
import { manifest as videoThumbnail }       from '@/tools/video-thumbnail/manifest';
import { manifest as videoThumbnailsGrid }  from '@/tools/video-thumbnails-grid/manifest';
import { manifest as videoExtractFrames }   from '@/tools/video-extract-frames/manifest';
import { manifest as videoToGif }           from '@/tools/video-to-gif/manifest';
import { manifest as videoMute }            from '@/tools/video-mute/manifest';
import { manifest as videoExtractAudio }    from '@/tools/video-extract-audio/manifest';
import { manifest as videoTrim }            from '@/tools/video-trim/manifest';

// --- Phase 2 wave 15 — ffmpeg-powered video + audio ---
import { manifest as videoConvertFormat } from '@/tools/video-convert-format/manifest';
import { manifest as videoCompress }      from '@/tools/video-compress/manifest';
import { manifest as videoResize }        from '@/tools/video-resize/manifest';
import { manifest as videoRotate }        from '@/tools/video-rotate/manifest';
import { manifest as videoFlip }          from '@/tools/video-flip/manifest';
import { manifest as videoMerge }         from '@/tools/video-merge/manifest';
import { manifest as videoSpeed }         from '@/tools/video-speed/manifest';
import { manifest as audioPitch }         from '@/tools/audio-pitch/manifest';
import { manifest as audioTempo }         from '@/tools/audio-tempo/manifest';
import { manifest as audioEcho }          from '@/tools/audio-echo/manifest';
import { manifest as audioBassBoost }     from '@/tools/audio-bass-boost/manifest';
import { manifest as audioTrebleBoost }   from '@/tools/audio-treble-boost/manifest';

// --- Phase 2 wave 10d — game ---
import { manifest as gameUsername }   from '@/tools/game-username/manifest';
import { manifest as gameName }       from '@/tools/game-name/manifest';
import { manifest as gameCharacter }  from '@/tools/game-character/manifest';
import { manifest as gameFantasy }    from '@/tools/game-fantasy/manifest';
import { manifest as gameSciFi }      from '@/tools/game-sci-fi/manifest';
import { manifest as gameGuild }      from '@/tools/game-guild/manifest';
import { manifest as gameClan }       from '@/tools/game-clan/manifest';
import { manifest as gameTeam }       from '@/tools/game-team/manifest';
import { manifest as gameWeapon }     from '@/tools/game-weapon/manifest';
import { manifest as gameSpell }      from '@/tools/game-spell/manifest';
import { manifest as gameQuest }      from '@/tools/game-quest/manifest';
import { manifest as gameDice }       from '@/tools/game-dice/manifest';
import { manifest as gameGacha }      from '@/tools/game-gacha/manifest';
import { manifest as gameDropRate }   from '@/tools/game-drop-rate/manifest';
import { manifest as gameLoadout }    from '@/tools/game-loadout/manifest';
import { manifest as gameCoin }       from '@/tools/game-coin/manifest';
import { manifest as gamePicker }     from '@/tools/game-picker/manifest';
import { manifest as gameLoot }       from '@/tools/game-loot/manifest';
import { manifest as gameDps }        from '@/tools/game-dps/manifest';
import { manifest as gameXp }         from '@/tools/game-xp/manifest';
import { manifest as gameDpi }        from '@/tools/game-dpi/manifest';
import { manifest as gameFov }        from '@/tools/game-fov/manifest';
import { manifest as gameSensitivity } from '@/tools/game-sensitivity/manifest';
import { manifest as gameAspectRatio } from '@/tools/game-aspect-ratio/manifest';
import { manifest as gameCrosshair }   from '@/tools/game-crosshair/manifest';
import { manifest as gameColorblind }  from '@/tools/game-colorblind/manifest';

// --- Phase 2 wave 16 — video (ffmpeg, second wave) ---
import { manifest as videoCrop }       from '@/tools/video-crop/manifest';
import { manifest as videoBrightness } from '@/tools/video-brightness/manifest';
import { manifest as videoBlur }       from '@/tools/video-blur/manifest';
import { manifest as videoWatermark }  from '@/tools/video-watermark/manifest';
import { manifest as videoAddText }    from '@/tools/video-add-text/manifest';

// --- Phase 2 wave 16 — audio (ffmpeg, second wave) ---
import { manifest as audioReverb }       from '@/tools/audio-reverb/manifest';
import { manifest as audioEqualizer }    from '@/tools/audio-equalizer/manifest';
import { manifest as audioCompress }     from '@/tools/audio-compress/manifest';
import { manifest as audioMonoToStereo } from '@/tools/audio-mono-to-stereo/manifest';
import { manifest as audioStereoToMono } from '@/tools/audio-stereo-to-mono/manifest';
import { manifest as audioRemoveSilence } from '@/tools/audio-remove-silence/manifest';

// --- Phase 2 wave 16 — image (hard) ---
import { manifest as imageCrop }      from '@/tools/image-crop/manifest';
import { manifest as imageAddText }   from '@/tools/image-add-text/manifest';
import { manifest as imageWatermark } from '@/tools/image-watermark/manifest';

// --- Phase 2 wave 16 — CSS generators ---
import { manifest as genBoxShadow }    from '@/tools/gen-box-shadow/manifest';
import { manifest as genCssFilter }     from '@/tools/gen-css-filter/manifest';
import { manifest as genCssTextShadow } from '@/tools/gen-css-text-shadow/manifest';
import { manifest as genCssTransform }  from '@/tools/gen-css-transform/manifest';
import { manifest as genFlexbox }      from '@/tools/gen-flexbox/manifest';
import { manifest as genGrid }         from '@/tools/gen-grid/manifest';
import { manifest as genAnimation }    from '@/tools/gen-animation/manifest';
import { manifest as genGlassmorphism } from '@/tools/gen-glassmorphism/manifest';

// --- Phase 2 wave 16 — code formatters ---
import { manifest as devHtmlFormat } from '@/tools/dev-html-format/manifest';
import { manifest as devCssFormat }  from '@/tools/dev-css-format/manifest';
import { manifest as devJsFormat }   from '@/tools/dev-js-format/manifest';

// --- Phase 2 wave 16 — heavy calc ---
import { manifest as calcMatrix }     from '@/tools/calc-matrix/manifest';
import { manifest as calcDerivative } from '@/tools/calc-derivative/manifest';
import { manifest as calcIntegral }   from '@/tools/calc-integral/manifest';
import { manifest as calcEquation }   from '@/tools/calc-equation/manifest';
import { manifest as calcLatex }      from '@/tools/calc-latex/manifest';

// --- Phase 2 wave 17 — browser-AI tier ---
import { manifest as imageOcr }         from '@/tools/image-ocr/manifest';
import { manifest as imageUpscale }     from '@/tools/image-upscale/manifest';
import { manifest as pdfOcr }           from '@/tools/pdf-ocr/manifest';
import { manifest as audioToText }      from '@/tools/audio-to-text/manifest';
import { manifest as audioRemoveNoise } from '@/tools/audio-remove-noise/manifest';

// --- Phase 2 wave 18 — deferred non-AI batches ---
import { manifest as pdfToText }        from '@/tools/pdf-to-text/manifest';
import { manifest as pdfToImages }      from '@/tools/pdf-to-images/manifest';
import { manifest as imagesToPdf }      from '@/tools/images-to-pdf/manifest';
import { manifest as audioTextToSpeech } from '@/tools/audio-text-to-speech/manifest';
import { manifest as audioWaveform }    from '@/tools/audio-waveform/manifest';
import { manifest as audioSplit }       from '@/tools/audio-split/manifest';
import { manifest as imageMeme }        from '@/tools/image-meme/manifest';
import { manifest as imageCollage }     from '@/tools/image-collage/manifest';
import { manifest as imageExif }        from '@/tools/image-exif/manifest';

// --- Phase 2 wave 19 — long-tail image, pdf, audio ---
import { manifest as imageThumbnail }    from '@/tools/image-thumbnail/manifest';
import { manifest as imageFrame }        from '@/tools/image-frame/manifest';
import { manifest as imageColorExtract } from '@/tools/image-color-extract/manifest';
import { manifest as imageAddShape }     from '@/tools/image-add-shape/manifest';
import { manifest as pdfFillForm }       from '@/tools/pdf-fill-form/manifest';
import { manifest as audioLoop }         from '@/tools/audio-loop/manifest';

// --- Phase 2 wave 20 — creative image, audio, generator ---
import { manifest as imagePattern }      from '@/tools/image-pattern/manifest';
import { manifest as imageAsciiArt }     from '@/tools/image-ascii-art/manifest';
import { manifest as imageEmojiMosaic }  from '@/tools/image-emoji-mosaic/manifest';
import { manifest as audioPan }          from '@/tools/audio-pan/manifest';
import { manifest as audioStereoWidth }  from '@/tools/audio-stereo-width/manifest';
import { manifest as genLoremImage }     from '@/tools/gen-lorem-image/manifest';

// --- Phase 2 wave 21 — PDF compress + security ---
import { manifest as pdfCompress }       from '@/tools/pdf-compress/manifest';
import { manifest as pdfProtect }        from '@/tools/pdf-protect/manifest';
import { manifest as pdfUnlock }         from '@/tools/pdf-unlock/manifest';

// --- Phase 2 wave 22 — dev + generator + image extras ---
import { manifest as devBase64Image }    from '@/tools/dev-base64-image/manifest';
import { manifest as genMeshGradient }   from '@/tools/gen-mesh-gradient/manifest';
import { manifest as imageDuotone }      from '@/tools/image-duotone/manifest';

// --- Phase 2 wave 23 — calculators, image utilities, batch image ---
import { manifest as calcBasic }         from '@/tools/calc-basic/manifest';
import { manifest as calcScientific }    from '@/tools/calc-scientific/manifest';
import { manifest as imageCompare }      from '@/tools/image-compare/manifest';
import { manifest as imageSplit }        from '@/tools/image-split/manifest';
import { manifest as imageAddShadow }    from '@/tools/image-add-shadow/manifest';
import { manifest as imageBatchResize }  from '@/tools/image-batch-resize/manifest';
import { manifest as imageBatchCompress } from '@/tools/image-batch-compress/manifest';
import { manifest as imageBatchConvert } from '@/tools/image-batch-convert/manifest';

// --- Phase 2 wave 24 — image merge + ffmpeg video ops ---
import { manifest as imageMerge }        from '@/tools/image-merge/manifest';
import { manifest as videoReverse }      from '@/tools/video-reverse/manifest';
import { manifest as videoVolume }       from '@/tools/video-volume/manifest';
import { manifest as videoBitrate }      from '@/tools/video-bitrate/manifest';
import { manifest as videoLoop }         from '@/tools/video-loop/manifest';
import { manifest as videoAddAudio }     from '@/tools/video-add-audio/manifest';
import { manifest as videoGifToVideo }   from '@/tools/video-gif-to-video/manifest';

// --- Phase 2 wave 25 — "impossible-made-possible" (network/API/DSP, no GPU) ---
import { manifest as audioVocalRemover } from '@/tools/audio-vocal-remover/manifest';
import { manifest as netDns }            from '@/tools/net-dns/manifest';
import { manifest as netWhois }          from '@/tools/net-whois/manifest';
import { manifest as netMyIp }           from '@/tools/net-my-ip/manifest';
import { manifest as netIpLookup }        from '@/tools/net-ip-lookup/manifest';
import { manifest as netSsl }             from '@/tools/net-ssl/manifest';
import { manifest as netPorts }           from '@/tools/net-ports/manifest';
import { manifest as netPing }            from '@/tools/net-ping/manifest';

// --- Phase 2 wave 26 — more web-based, no GPU ---
import { manifest as imageDenoise }      from '@/tools/image-denoise/manifest';
import { manifest as imagesToVideo }     from '@/tools/images-to-video/manifest';

// --- Phase 2 wave 27 — universal converter (client-side dispatch matrix) ---
import { manifest as convertAnything }   from '@/tools/convert-anything/manifest';

// --- Phase 2 wave 28 — archive + 3D (WASM, no GPU) ---
import { manifest as archiveExtract }    from '@/tools/archive-extract/manifest';
import { manifest as archiveZip }        from '@/tools/archive-zip/manifest';
import { manifest as model3dConvert }    from '@/tools/model-3d-convert/manifest';

// --- Phase 2 wave 29 — documents (SheetJS + mammoth) ---
import { manifest as sheetConvert }      from '@/tools/sheet-convert/manifest';
import { manifest as docConvert }        from '@/tools/doc-convert/manifest';

// --- Phase 2 wave 30 — ebooks + CAD (completes the "impossible five") ---
import { manifest as ebookConvert }      from '@/tools/ebook-convert/manifest';
import { manifest as cadConvert }        from '@/tools/cad-convert/manifest';

// --- Phase 2 wave 31 — light office (odt/odp/pptx + legacy doc/ppt) ---
import { manifest as slidesConvert }     from '@/tools/slides-convert/manifest';

// --- Phase 2 wave 32 — high-traffic browser tools ---
import { manifest as imageHeicConvert }  from '@/tools/image-heic-convert/manifest';
import { manifest as videoScreenRecord } from '@/tools/video-screen-record/manifest';
import { manifest as imageTextBehind }   from '@/tools/image-text-behind/manifest';
import { manifest as subtitleGenerate }  from '@/tools/subtitle-generate/manifest';

// --- Phase 2 wave 33 — privacy/AI/doc + self-hosted FX ---
import { manifest as financeCurrency }   from '@/tools/finance-currency/manifest';
import { manifest as imageRemoveMetadata } from '@/tools/image-remove-metadata/manifest';
import { manifest as pdfSign }           from '@/tools/pdf-sign/manifest';
import { manifest as imageDocScan }      from '@/tools/image-doc-scan/manifest';
import { manifest as imageObjectRemove } from '@/tools/image-object-remove/manifest';

// --- Phase 2 wave 34 — flagship: speed test + webcam tester (+ /clipboard P2P page) ---
import { manifest as netSpeedTest }      from '@/tools/net-speed-test/manifest';
import { manifest as videoWebcamTest }   from '@/tools/video-webcam-test/manifest';

// --- Phase 2 wave 35 — creator: vertical reframe (+ /chat on-device AI, /watch, /call pages) ---
import { manifest as videoReframe }      from '@/tools/video-reframe/manifest';

// --- Phase 2 wave 36 — AI segmentation ---
import { manifest as imageSmartCutout }  from '@/tools/image-smart-cutout/manifest';

/**
 * Central registry. Manifests live next to their `ui.tsx` so the unit of
 * migration is one folder. New tools get appended here + a dynamic loader
 * entry in `app/tools/[slug]/page.tsx`.
 */
export const TOOLS: ToolManifest[] = [
  // image
  imageBlur,
  imageFaceDetect,
  imageRemoveBg,
  imageCompress,
  imageConvertFormat,
  imageResize,
  imageGrayscale,
  imageInvert,
  imageSepia,
  imageBrightness,
  imageContrast,
  imageSaturation,
  imageHue,
  imageFlip,
  imageRotate,
  imagePixelate,
  imageSharpen,
  imageVintage,
  imageVignette,
  imageBorder,
  imageRoundCorners,
  imageInfo,
  imagePlaceholder,
  // text
  textUppercase,
  textLowercase,
  textTitleCase,
  textReverse,
  textWordCounter,
  textBase64,
  textSentenceCase,
  textCamelCase,
  textPascalCase,
  textSnakeCase,
  textKebabCase,
  textUrlEncode,
  textUrlDecode,
  textHtmlEncode,
  textRot13,
  textAddPrefix,
  textAddSuffix,
  textAddLineNumbers,
  textAddLineBreaks,
  textRemoveEmptyLines,
  textRemoveDuplicates,
  textRemoveExtraSpaces,
  textRemoveNumbers,
  textRemoveLetters,
  textSortLines,
  textReverseLines,
  textFindReplace,
  textRegex,
  textExtractEmails,
  textExtractUrls,
  textExtractNumbers,
  textExtractPhone,
  textExtractHashtags,
  textExtractMentions,
  textKeywordDensity,
  textReadability,
  // dev
  devJsonFormat,
  devUuid,
  devHash,
  devSlug,
  devLorem,
  devJsonMinify,
  devJsonValidate,
  devJsonToYaml,
  devYamlToJson,
  devXmlFormat,
  devJwtDecode,
  devHexViewer,
  devPassword,
  devRegex,
  devDiff,
  devBcrypt,
  devHmac,
  devTotp,
  devSqlFormat,
  // calc
  calcPercent,
  calcAge,
  calcBmi,
  calcLoan,
  calcTip,
  calcTemp,
  calcPower,
  calcHex,
  calcBinary,
  calcDate,
  calcTime,
  // time
  timeUnix,
  timeIso,
  timeCron,
  timeDateDiff,
  timeCountdown,
  timeWorldClock,
  timeTimezone,
  // generators
  genQrCode,
  genBarcode,
  genColorPalette,
  genGradient,
  genColorConverter,
  genColorContrast,
  genRandomData,
  genFavicon,
  genInvoice,
  genResume,
  // subtitle
  subCharCounter,
  subCleaner,
  subFpsConverter,
  subMerger,
  subSplitter,
  subStyleEditor,
  subSyncFixer,
  subTimingShifter,
  subToPlainText,
  subTranslatorPrep,
  // finance
  financeBudget,
  financeMortgage,
  financeLoanCompare,
  financeInvestment,
  financeRetirement,
  financeSavings,
  financeTax,
  // gis
  gisCoords,
  gisDistance,
  gisUtm,
  gisKml,
  gisGeoJson,
  // seo
  seoMetaTag,
  seoRobotsTxt,
  seoSitemap,
  seoHeadings,
  seoStructured,
  seoOpenGraph,
  seoTwitterCard,
  // game
  gameUsername,
  gameName,
  gameCharacter,
  gameFantasy,
  gameSciFi,
  gameGuild,
  gameClan,
  gameTeam,
  gameWeapon,
  gameSpell,
  gameQuest,
  gameDice,
  gameGacha,
  gameDropRate,
  gameLoadout,
  gameCoin,
  gamePicker,
  gameLoot,
  gameDps,
  gameXp,
  gameDpi,
  gameFov,
  gameSensitivity,
  gameAspectRatio,
  gameCrosshair,
  gameColorblind,
  // network
  netCidr,
  netSubnet,
  netUa,
  netMac,
  netHeaders,
  // social
  socialResize,
  socialOg,
  socialBanner,
  socialAvatar,
  // font
  fontPreview,
  fontInspect,
  fontConvert,
  fontWeb,
  fontSubset,
  // pdf
  pdfMerge,
  pdfSplit,
  pdfRotate,
  pdfInfo,
  pdfPageNumbers,
  pdfWatermark,
  pdfDeletePages,
  pdfExtractPages,
  pdfReorder,
  // audio
  audioTrim,
  audioMerge,
  audioVolume,
  audioFadeIn,
  audioFadeOut,
  audioNormalize,
  audioSpeed,
  audioConvertFormat,
  audioReverse,
  // video
  videoInfo,
  videoPoster,
  videoThumbnail,
  videoThumbnailsGrid,
  videoExtractFrames,
  videoToGif,
  videoMute,
  videoExtractAudio,
  videoTrim,
  // video — ffmpeg powered
  videoConvertFormat,
  videoCompress,
  videoResize,
  videoRotate,
  videoFlip,
  videoMerge,
  videoSpeed,
  // audio — ffmpeg powered
  audioPitch,
  audioTempo,
  audioEcho,
  audioBassBoost,
  audioTrebleBoost,
  // wave 16 — video (ffmpeg, 2nd wave)
  videoCrop,
  videoBrightness,
  videoBlur,
  videoWatermark,
  videoAddText,
  // wave 16 — audio (ffmpeg, 2nd wave)
  audioReverb,
  audioEqualizer,
  audioCompress,
  audioMonoToStereo,
  audioStereoToMono,
  audioRemoveSilence,
  // wave 16 — image (hard)
  imageCrop,
  imageAddText,
  imageWatermark,
  // wave 16 — CSS generators
  genBoxShadow,
  genCssFilter,
  genCssTextShadow,
  genCssTransform,
  genFlexbox,
  genGrid,
  genAnimation,
  genGlassmorphism,
  // wave 16 — code formatters
  devHtmlFormat,
  devCssFormat,
  devJsFormat,
  // wave 16 — heavy calc
  calcMatrix,
  calcDerivative,
  calcIntegral,
  calcEquation,
  calcLatex,
  // wave 17 — browser-AI tier
  imageOcr,
  imageUpscale,
  pdfOcr,
  audioToText,
  audioRemoveNoise,
  // wave 18 — deferred non-AI batches
  pdfToText,
  pdfToImages,
  imagesToPdf,
  audioTextToSpeech,
  audioWaveform,
  audioSplit,
  imageMeme,
  imageCollage,
  imageExif,
  // wave 19 — long-tail image, pdf, audio
  imageThumbnail,
  imageFrame,
  imageColorExtract,
  imageAddShape,
  pdfFillForm,
  audioLoop,
  // wave 20 — creative image, audio, generator
  imagePattern,
  imageAsciiArt,
  imageEmojiMosaic,
  audioPan,
  audioStereoWidth,
  genLoremImage,
  // wave 21 — PDF compress + security
  pdfCompress,
  pdfProtect,
  pdfUnlock,
  // wave 22 — dev + generator + image extras
  devBase64Image,
  genMeshGradient,
  imageDuotone,
  // wave 23 — calculators, image utilities, batch image
  calcBasic,
  calcScientific,
  imageCompare,
  imageSplit,
  imageAddShadow,
  imageBatchResize,
  imageBatchCompress,
  imageBatchConvert,
  // wave 24 — image merge + ffmpeg video ops
  imageMerge,
  videoReverse,
  videoVolume,
  videoBitrate,
  videoLoop,
  videoAddAudio,
  videoGifToVideo,
  // wave 25 — impossible-made-possible (network/API/DSP, no GPU)
  audioVocalRemover,
  netDns,
  netWhois,
  netMyIp,
  netIpLookup,
  netSsl,
  netPorts,
  netPing,
  // wave 26 — more web-based, no GPU
  imageDenoise,
  imagesToVideo,
  // wave 27 — universal converter
  convertAnything,
  // wave 28 — archive + 3D
  archiveExtract,
  archiveZip,
  model3dConvert,
  // wave 29 — documents
  sheetConvert,
  docConvert,
  // wave 30 — ebooks + CAD
  ebookConvert,
  cadConvert,
  // wave 31 — light office (presentations)
  slidesConvert,
  // wave 32 — high-traffic browser tools
  imageHeicConvert,
  videoScreenRecord,
  imageTextBehind,
  subtitleGenerate,
  // wave 33 — privacy/AI/doc + self-hosted FX
  financeCurrency,
  imageRemoveMetadata,
  pdfSign,
  imageDocScan,
  imageObjectRemove,
  // wave 34 — flagship utilities
  netSpeedTest,
  videoWebcamTest,
  // wave 35 — creator
  videoReframe,
  // wave 36 — AI segmentation
  imageSmartCutout,
];

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function getTool(id: string): ToolManifest | undefined {
  return TOOL_BY_ID.get(id);
}

export function toolsByCategory(category: ToolManifest['category']): ToolManifest[] {
  return TOOLS.filter((t) => t.category === category);
}

export function searchTools(query: string): ToolManifest[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  return TOOLS.filter((t) => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.blurb.toLowerCase().includes(q)) return true;
    if (t.id.includes(q)) return true;
    return t.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
  });
}

export type { ToolManifest };
export { CATEGORIES } from './types';
