import { createRouter, createWebHashHistory } from 'vue-router';
import Login from '@/views/Login.vue';
import Profile from '@/views/Profile.vue';
import Home from '@/views/Home.vue';
import Ranking from '@/views/Ranking.vue';
import Search from '@/views/Search.vue';
import PlaylistDetail from '@/views/PlaylistDetail.vue';
import Library from '@/views/Library.vue';
import Discover from '@/views/Discover.vue';
import VideoPlayer from '@/views/VideoPlayer.vue';
import Download from '@/views/Download.vue';
import { MoeAuthStore } from '@/stores/store';

const routes = [
    { path: '/', redirect: '/home' },
    { path: '/login', name: 'Login', component: Login },
    { path: '/home', name: 'Home', component: Home },
    { path: '/profile', name: 'Profile', component: Profile, meta: { requiresAuth: true } },
    { path: '/ranking', name: 'Ranking', component: Ranking },
    { path: '/search', name: 'Search', component: Search },
    { path: '/playlistDetail', name: 'PlaylistDetail', component: PlaylistDetail },
    { path: '/library', name: 'Library', component: Library, meta: { requiresAuth: true } },
    { path: '/discover', name: 'Discover', component: Discover },
    { path: '/videoPlayer', name: 'VideoPlayer', component: VideoPlayer },
    { path: '/download', name: 'Download', component: Download },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach((to, from, next) => {
    const MoeAuth = MoeAuthStore();
    if (to.matched.some(record => record.meta.requiresAuth)) {
        if (!MoeAuth.isAuthenticated) {
            next({ path: '/login', query: { redirect: to.fullPath } });
        } else {
            next();
        }
    } else {
        next();
    }
});

export default router;
