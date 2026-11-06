# Import toolbar fix

Actual iOS view renders from five passing MezzanineReviewSnapshotTests, 6 November 2026. The small-phone render is hosted inside a TabView to cover the reported native tab-bar overlap. Review keeps the tab bar visible and places its action in a bottom safe-area inset above the tabs. Private-note notices are removed; parser exclusion remains.

![Small phone in tab navigation](ios-small-tab-navigation.png)
![Bulk review](ios-bulk.png)
