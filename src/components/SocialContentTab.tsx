'use client';

import { useState, useEffect } from 'react';

interface SocialContentPost {
    id: string;
    category: 'performance' | 'macro' | 'educational' | 'market';
    content: string;
    hashtags: string[];
    characterCount: number;
    timestamp: number;
    data: any;
}

interface SocialContentResponse {
    success: boolean;
    posts: SocialContentPost[];
    stats?: any;
    macroData?: any;
    generatedAt: string;
}

interface SocialContentTabProps {
    fromDate?: string;
    toDate?: string;
}

export default function SocialContentTab({ fromDate, toDate }: SocialContentTabProps) {
    const [posts, setPosts] = useState<SocialContentPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const categories = [
        { value: 'all', label: 'All Content', color: 'bg-gray-500' },
        { value: 'performance', label: 'Performance', color: 'bg-emerald-500' },
        { value: 'macro', label: 'Macro Analysis', color: 'bg-blue-500' },
        { value: 'educational', label: 'Alpha Metrics', color: 'bg-purple-500' },
        { value: 'market', label: 'Live Telemetry', color: 'bg-orange-500' }
    ];

    useEffect(() => {
        fetchSocialContent();
    }, [fromDate, toDate, refreshKey]);

    const fetchSocialContent = async () => {
        setLoading(true);
        try {
            let url = '/api/account/social-content';
            if (fromDate && toDate) {
                const params = new URLSearchParams({
                    from: fromDate,
                    to: toDate
                });
                url += `?${params.toString()}`;
            }

            console.log('Fetching social content from:', url);
            const res = await fetch(url);
            if (res.ok) {
                const data: SocialContentResponse = await res.json();
                console.log('Social content response:', data);
                setPosts(data.posts || []);
                console.log('Posts set:', data.posts?.length || 0);
            } else {
                console.error('Failed to fetch social content:', res.status, res.statusText);
            }
        } catch (err) {
            console.error('Failed to fetch social content:', err);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async (postId: string, content: string) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedId(postId);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    const filteredPosts = selectedCategory === 'all'
        ? posts
        : posts.filter(post => post.category === selectedCategory);

    console.log('Selected category:', selectedCategory);
    console.log('Total posts:', posts.length);
    console.log('Filtered posts:', filteredPosts.length);

    const getCategoryColor = (category: string) => {
        const cat = categories.find(c => c.value === category);
        return cat ? cat.color : 'bg-gray-500';
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header - Condensed */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-base font-bold text-white">Social Content Generator</h3>
                    <p className="text-[9px] text-gray-400">Twitter-ready drafts based on your trading data</p>
                </div>
                <button
                    onClick={() => setRefreshKey(prev => prev + 1)}
                    className="rounded-lg bg-white/5 px-2 py-1 text-[9px] text-white hover:bg-white/10 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Category Filter - Condensed */}
            <div className="flex flex-wrap gap-1 mb-4">
                {categories.map((category) => (
                    <button
                        key={category.value}
                        onClick={() => setSelectedCategory(category.value)}
                        className={`rounded-full px-2 py-1 text-[9px] font-medium transition-all ${selectedCategory === category.value
                                ? `${category.color} text-white`
                                : 'bg-white/10 text-gray-400 hover:bg-white/20'
                            }`}
                    >
                        {category.label}
                    </button>
                ))}
            </div>

            {/* Posts Grid - Condensed */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {/* Debug Info */}
                <div className="text-[8px] text-gray-500 p-2 bg-black/20 rounded">
                    Debug: Total posts: {posts.length}, Filtered: {filteredPosts.length}, Category: {selectedCategory}
                </div>

                {filteredPosts.length === 0 ? (
                    <div className="rounded-xl border border-white/5 bg-black/40 p-6 text-center">
                        <p className="text-gray-400 text-sm">No content available for the selected period</p>
                        <p className="text-[10px] text-gray-500 mt-1">Generate some trades or check back later</p>
                    </div>
                ) : (
                    filteredPosts.map((post) => (
                        <div key={post.id} className="rounded-lg border border-white/5 bg-black/40 p-3 space-y-2">
                            {/* Post Header - Condensed */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`h-1.5 w-1.5 rounded-full ${getCategoryColor(post.category)}`} />
                                    <span className="text-[9px] font-medium text-gray-400 uppercase">
                                        {post.category}
                                    </span>
                                    <span className="text-[8px] text-gray-500">
                                        {formatTimestamp(post.timestamp)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-medium ${post.characterCount > 280 ? 'text-red-400' : 'text-gray-500'
                                        }`}>
                                        {post.characterCount}/280
                                    </span>
                                    <button
                                        onClick={() => copyToClipboard(post.id, post.content)}
                                        className={`rounded px-2 py-0.5 text-[8px] font-medium transition-all ${copiedId === post.id
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                            }`}
                                    >
                                        {copiedId === post.id ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                            </div>

                            {/* Post Content - Condensed */}
                            <div className="bg-black/20 rounded p-2">
                                <p className="text-xs text-white leading-snug">
                                    {post.content}
                                </p>
                            </div>

                            {/* Hashtags - Condensed */}
                            {post.hashtags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {post.hashtags.map((tag, index) => (
                                        <span key={index} className="text-[9px] text-emerald-400">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Character Count Warning - Condensed */}
                            {post.characterCount > 280 && (
                                <div className="rounded bg-red-500/10 border border-red-500/20 p-1">
                                    <p className="text-[8px] text-red-400">
                                        Exceeds 280 character limit
                                    </p>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer Info - Condensed */}
            <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                <p className="text-[8px] text-gray-500 text-center">
                    Content generated based on trading performance and market data. Review before posting to X.com/Twitter.
                </p>
            </div>
        </div>
    );
}
