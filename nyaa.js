/**
 * Nyaa.si & Sukebei.nyaa.si — Unified Extension for Hayase
 * Repository: yatsimuratsuyuno/Anime-Torrent-Test
 * Version: 1.0.1
 * Compatible: Desktop + Android WebView
 */

// ─── Polyfill untuk WebView Lama ──────────────────
function fetchWithTimeout(url, options, timeout) {
  return new Promise(function(resolve, reject) {
    var controller = new AbortController();
    var signal = controller.signal;
    var timer = setTimeout(function() {
      controller.abort();
    }, timeout || 8000);
    
    fetch(url, Object.assign({}, options || {}, { signal: signal }))
      .then(function(res) {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(function(err) {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─── Constants ───────────────────────────────────
var SIZE_REGEX = /(\d+(?:\.\d+)?)\s*(GiB|MiB|KiB|GB|MB|KB|B)/i;
var HASH_REGEX = /btih:([a-fA-F0-9]{40})/;

// ─── Utility Functions ───────────────────────────
function parseSize(str) {
  if (!str) return 0;
  var m = str.match(SIZE_REGEX);
  if (!m) return 0;
  var v = parseFloat(m[1]);
  var unit = (m[2] || '').toUpperCase();
  if (unit === 'GIB' || unit === 'GB') v = v * 1073741824;
  else if (unit === 'MIB' || unit === 'MB') v = v * 1048576;
  else if (unit === 'KIB' || unit === 'KB') v = v * 1024;
  return Math.round(v);
}

function parseNum(str) {
  var n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

function extractHash(link) {
  var m = link.match(HASH_REGEX);
  return m ? m[1].toLowerCase() : '';
}

function detectBatch(title) {
  return /\b(batch|complete|season\s*\d+|1-?\d+|s\d{2})\b/i.test(title) ? 'batch' : undefined;
}

// ─── RSS Parser ──────────────────────────────────
function parseRSS(xml) {
  var results = [];
  var re = /<item>([\s\S]*?)<\/item>/gi;
  var m;
  while ((m = re.exec(xml)) !== null) {
    var item = m[1];
    
    var titleMatch = item.match(/<title>(.*?)<\/title>/i);
    var title = titleMatch ? titleMatch[1].trim() : '';
    
    var linkMatch = item.match(/<link>(.*?)<\/link>/i);
    var link = linkMatch ? linkMatch[1] : '';
    
    var hashMatch = item.match(/<nyaa:infohash>([a-fA-F0-9]{40})<\/nyaa:infohash>/i);
    var hash = hashMatch ? hashMatch[1].toLowerCase() : extractHash(link);
    if (!hash) hash = extractHash(link);
    
    var magnet = 'magnet:?xt=urn:btih:' + hash;
    
    var seedsMatch = item.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/i);
    var leechMatch = item.match(/<nyaa:leechers>(\d+)<\/nyaa:leechers>/i);
    var dlMatch = item.match(/<nyaa:downloads>(\d+)<\/nyaa:downloads>/i);
    var sizeMatch = item.match(/<nyaa:size>(.*?)<\/nyaa:size>/i);
    var dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);
    
    results.push({
      title: title,
      link: magnet,
      seeders: parseNum(seedsMatch ? seedsMatch[1] : '0'),
      leechers: parseNum(leechMatch ? leechMatch[1] : '0'),
      downloads: parseNum(dlMatch ? dlMatch[1] : '0'),
      accuracy: 'medium',
      hash: hash,
      size: parseSize(sizeMatch ? sizeMatch[1] : ''),
      date: dateMatch ? new Date(dateMatch[1]) : new Date(),
      type: detectBatch(title)
    });
  }
  return results;
}

// ─── HTML Parser (Fallback) ──────────────────────
function parseHTML(html) {
  var results = [];
  var re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var row = m[1];
    
    var magnetMatch = row.match(/href="(magnet:\?xt=urn:btih:[^"]+)"/i);
    if (!magnetMatch) continue;
    var magnet = magnetMatch[1];
    
    var titleMatch = row.match(/title="([^"]*?)"/i);
    var titleFallback = row.match(/colspan="2"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    var title = titleMatch ? titleMatch[1] : (titleFallback ? titleFallback[1].trim() : '');
    
    var hash = extractHash(magnet);
    
    var seedsMatch = row.match(/color:\s*green[^>]*>\s*(\d+)/i);
    var leechMatch = row.match(/color:\s*red[^>]*>\s*(\d+)/i);
    var sizeMatch = row.match(/>\s*([\d.]+ (?:GiB|MiB|KiB|GB|MB|KB|B))\s*</i);
    var dateMatch = row.match(/>\s*(\d{4}-\d{2}-\d{2})\s*</i);
    
    results.push({
      title: title,
      link: magnet,
      seeders: parseNum(seedsMatch ? seedsMatch[1] : '0'),
      leechers: parseNum(leechMatch ? leechMatch[1] : '0'),
      downloads: 0,
      accuracy: 'medium',
      hash: hash,
      size: parseSize(sizeMatch ? sizeMatch[1] : ''),
      date: dateMatch ? new Date(dateMatch[1]) : new Date(),
      type: detectBatch(title)
    });
  }
  return results;
}

// ─── Filter Exclusions ───────────────────────────
function applyExclusions(results, exclusions) {
  if (!exclusions || !exclusions.length) return results;
  return results.filter(function(r) {
    var lower = r.title.toLowerCase();
    for (var i = 0; i < exclusions.length; i++) {
      if (lower.indexOf(exclusions[i].toLowerCase()) !== -1) return false;
    }
    return true;
  });
}

// ─── Build Search Query ──────────────────────────
function buildSearchQuery(titles, episode) {
  var q = '';
  if (titles && titles.length > 0) q = titles[0].trim();
  if (episode) q = q + ' ' + (episode < 10 ? '0' : '') + episode;
  return q;
}

// ══════════════════════════════════════════════════
//  MAIN EXTENSION EXPORT
// ══════════════════════════════════════════════════
var extension = {
  
  // ── Health Check ─────────────────────────────
  test: function() {
    var domains = ['nyaa.si', 'sukebei.nyaa.si'];
    
    function tryDomain(index) {
      if (index >= domains.length) {
        throw new Error('Tidak dapat terhubung ke Nyaa.si maupun Sukebei. Periksa koneksi internet atau firewall Anda.');
      }
      
      return fetchWithTimeout('https://' + domains[index] + '/', { method: 'HEAD' }, 5000)
        .then(function(res) {
          if (res.ok) return true;
          return tryDomain(index + 1);
        })
        .catch(function() {
          return tryDomain(index + 1);
        });
    }
    
    return tryDomain(0);
  },
  
  // ── Single Episode Search ────────────────────
  single: function(query, options) {
    return this._search(query, options);
  },
  
  // ── Batch Search ─────────────────────────────
  batch: function(query, options) {
    return this._search(query, options);
  },
  
  // ── Movie Search ─────────────────────────────
  movie: function(query, options) {
    return this._search(query, options);
  },
  
  // ── Core Search Logic ────────────────────────
  _search: function(query, options) {
    options = options || {};
    var titles = query.titles || [];
    var episode = query.episode;
    var exclusions = query.exclusions || [];
    var fetchFn = query.fetch || fetch;
    
    var limit = Math.min(options.limit || 50, 100);
    var filter = options.filter || '0';
    var category = options.category || '0_0';
    
    var searchQuery = buildSearchQuery(titles, episode);
    if (!searchQuery) {
      throw new Error('Tidak ada judul untuk dicari. Masukkan judul anime terlebih dahulu.');
    }
    
    var domains = ['nyaa.si', 'sukebei.nyaa.si'];
    var encodedQuery = encodeURIComponent(searchQuery);
    
    function trySearch(index) {
      if (index >= domains.length) {
        throw new Error('Pencarian gagal di kedua domain. Coba lagi nanti.');
      }
      
      var domain = domains[index];
      var rssUrl = 'https://' + domain + '/?page=rss&f=' + filter + '&c=' + category + '&q=' + encodedQuery;
      
      return fetchWithTimeout(rssUrl, {}, 10000)
        .then(function(res) {
          if (!res.ok) return trySearch(index + 1);
          return res.text();
        })
        .then(function(text) {
          if (!text || text.length < 50) return trySearch(index + 1);
          
          var results;
          if (text.indexOf('<item>') !== -1) {
            results = parseRSS(text);
          } else if (text.indexOf('table-bordered') !== -1) {
            results = parseHTML(text);
          } else {
            return trySearch(index + 1);
          }
          
          if (!results || results.length === 0) return trySearch(index + 1);
          
          results = applyExclusions(results, exclusions);
          
          results.sort(function(a, b) {
            return b.seeders - a.seeders;
          });
          
          return results.slice(0, limit);
        })
        .catch(function(err) {
          if (index < domains.length - 1) return trySearch(index + 1);
          throw err;
        });
    }
    
    return trySearch(0);
  }
};

export default extension;
