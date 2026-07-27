<?php
/**
 * Disables the admin email confirmation screen in E2E tests.
 *
 * The database fixture bakes in a fixed `admin_email_lifespan` timestamp, so once
 * that time passes WordPress redirects every admin login to
 * `wp-login.php?action=confirm_admin_email` instead of wp-admin, breaking the
 * Playwright global setup. Returning 0 from this filter disables the check
 * regardless of the stored option value.
 *
 * @package HM\QueryLoop\Tests
 */

add_filter( 'admin_email_check_interval', '__return_zero' );
