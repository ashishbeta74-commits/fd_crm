// North American area codes: which state / province each belongs to, and how to read one off a phone number.
// The team's sheets write phones every way ("(212) 555-0100", "+1 212.555.0100", "2125550100"), so the code
// is taken from a number that looks like a full NANP number, never from a bare digit prefix.

const BY_REGION = {
  AL: '205 251 256 334 659 938',
  AK: '907',
  AZ: '480 520 602 623 928',
  AR: '327 479 501 870',
  CA: '209 213 279 310 323 341 350 369 408 415 424 442 510 530 559 562 619 626 628 650 657 661 669 707 714 747 760 805 818 820 831 840 858 909 916 925 949 951',
  CO: '303 719 720 970 983',
  CT: '203 475 860 959',
  DE: '302',
  DC: '202 771',
  FL: '239 305 321 324 352 386 407 448 561 645 656 689 727 728 754 772 786 813 850 863 904 941 954',
  GA: '229 404 470 478 678 706 762 770 912 943',
  HI: '808',
  ID: '208 986',
  IL: '217 224 309 312 331 447 464 618 630 708 730 773 779 815 847 861 872',
  IN: '219 260 317 463 574 765 812 930',
  IA: '319 515 563 641 712',
  KS: '316 620 785 913',
  KY: '270 364 502 606 859',
  LA: '225 318 337 504 985',
  ME: '207',
  MD: '227 240 301 410 443 667',
  MA: '339 351 413 508 617 774 781 857 978',
  MI: '231 248 269 313 517 586 616 679 734 810 906 947 989',
  MN: '218 320 507 612 651 763 952',
  MS: '228 601 662 769',
  MO: '314 417 557 573 636 660 816 975',
  MT: '406',
  NE: '308 402 531',
  NV: '702 725 775',
  NH: '603',
  NJ: '201 551 609 640 732 848 856 862 908 973',
  NM: '505 575',
  NY: '212 315 329 332 347 363 516 518 585 607 624 631 646 680 716 718 838 845 914 917 929 934',
  NC: '252 336 472 704 743 828 910 919 980 984',
  ND: '701',
  OH: '216 220 234 283 326 330 380 419 436 440 513 567 614 740 937',
  OK: '405 539 572 580 918',
  OR: '458 503 541 971',
  PA: '215 223 267 272 412 445 484 570 582 610 717 724 814 835 878',
  RI: '401',
  SC: '803 821 839 843 854 864',
  SD: '605',
  TN: '423 615 629 731 865 901 931',
  TX: '210 214 254 281 325 346 361 409 430 432 469 512 682 713 726 737 806 817 830 832 903 915 936 940 945 956 972 979',
  UT: '385 435 801',
  VT: '802',
  VA: '276 434 540 571 686 703 757 804 826 948',
  WA: '206 253 360 425 509 564',
  WV: '304 681',
  WI: '262 274 353 414 534 608 715 920',
  WY: '307',
  PR: '787 939',
  // Canada
  ON: '226 249 289 343 365 382 416 437 519 548 613 647 683 705 742 753 807 905 942',
  QC: '367 418 438 450 468 514 579 581 819 873',
  BC: '236 250 257 604 672 778',
  AB: '368 403 587 780 825',
  MB: '204 431 584',
  SK: '306 474 639',
  'NS/PE': '782 902',
  NB: '428 506',
  NL: '709 879',
  'YT/NT/NU': '867',
  'Toll-free': '800 833 844 855 866 877 888',
};

export const AREA_CODE_REGION = Object.fromEntries(Object.entries(BY_REGION).flatMap(([region, codes]) => codes.split(' ').map((c) => [c, region])));

// A full NANP number at the start of the field: optional +1 / 1, the area code (captured), then 3 + 4 digits.
const NANP = (code) => `^\\D*(?:\\+?1[\\s.\\-)]*)?\\(?(${code})\\)?[\\s.\\-]*[2-9]\\d{2}[\\s.\\-]*\\d{4}`;

/** Regex source that captures the area code (for $regexFind in the meta aggregation). */
export const AREA_CODE_PATTERN = NANP('[2-9]\\d{2}');

/** Regex matching phones with this area code (for the contacts filter). */
export const areaCodeRegex = (code) => new RegExp(NANP(code));

/** The area code of a phone number, or '' when it is not a recognisable North American number. */
export function areaCodeOf(phone) {
  const m = String(phone || '').match(new RegExp(AREA_CODE_PATTERN));
  return m ? m[1] : '';
}
