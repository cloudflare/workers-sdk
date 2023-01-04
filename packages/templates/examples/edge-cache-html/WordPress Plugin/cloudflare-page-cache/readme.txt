=== Cloudflare Page Cache ===
Contributors: patrickmeenan, jwineman, furkan811, icyapril, manatarms
Tags: cache,performance,speed,cloudflare
Requires at least: 3.3.1
Tested up to: 5.2
Requires PHP: 5.2.4
Stable tag: trunk
License: GPLv2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html

Adds support for caching pages on Cloudflare and automatic purging when content changes.

== Description ==
Integrates with the "[Edge Cache HTML](https://github.com/cloudflare/worker-examples/tree/master/examples/edge-cache-html)" Cloudflare Worker to edge-cache the generated HTML for anonymous users (not logged-in) resulting in huge performance gains, particularly on slower hosting.

== Installation ==
# FROM YOUR WORDPRESS DASHBOARD
1. Visit “Plugins” → Add New
1. Search for "Cloudflare Page Cache"
1. Activate Cloudflare Page Cache from your Plugins page.

# FROM WORDPRESS.ORG
1. Download [Cloudflare Page Cache](https://wordpress.org/plugins/cloudflare-page-cache/)
1. Upload the “cloudflare-page-cache” directory to your “/wp-content/plugins/” directory, using ftp, sftp, scp etc.
1. Activate Cloudflare Page Cache from your Plugins page.