const TABS = [
  {
    pagePath: "/pages/home/index",
    route: "pages/home/index",
    text: "今日",
    icon: "/images/home.png",
    activeIcon: "/images/home-active.png"
  },
  {
    pagePath: "/pages/journal/index",
    route: "pages/journal/index",
    text: "日记",
    icon: "/images/journal.png",
    activeIcon: "/images/journal-active.png"
  },
  {
    pagePath: "/pages/goals/index",
    route: "pages/goals/index",
    text: "目标",
    icon: "/images/goals.png",
    activeIcon: "/images/goals-active.png"
  }
];

Component({
  data: {
    selected: 0,
    tabs: TABS
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (!current) return;
      const index = this.data.tabs.findIndex((tab) => tab.route === current.route);
      if (index >= 0 && index !== this.data.selected) {
        this.setData({ selected: index });
      }
    },

    onTab(event) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      if (!tab) return;
      const pages = getCurrentPages();
      const current = pages[pages.length - 1];
      if (current && tab.route === current.route) return;
      // 先切换胶囊位置，再切页，避免等待新页面渲染。
      this.setData({ selected: index });
      wx.switchTab({ url: tab.pagePath });
    }
  }
});
