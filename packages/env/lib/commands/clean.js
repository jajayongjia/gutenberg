/**
 * Internal dependencies
 */
const initConfig = require( '../init-config' );
const { configureWordPress, resetDatabase } = require( '../wordpress' );

/**
 * Wipes the development server's database, the tests server's database, or both.
 *
 * @param {Object}  options
 * @param {string}  options.environment The environment to clean. Either 'development', 'tests', or 'all'.
 * @param {Object}  options.spinner     A CLI spinner which indicates progress.
 * @param {boolean} options.debug       True if debug mode is enabled.
 */
module.exports = async function clean( { environment, spinner, debug } ) {
	const config = await initConfig( { spinner, debug } );

	const description = `${ environment } environment${
		environment === 'all' ? 's' : ''
	}`;
	spinner.text = `Cleaning ${ description }.`;

	const tasks = [];

	if ( environment === 'all' || environment === 'development' ) {
		tasks.push(
			resetDatabase( 'development', config )
				.then( () => configureWordPress( 'development', config ) )
				.catch( () => {} )
		);
	}

	if ( environment === 'all' || environment === 'tests' ) {
		tasks.push(
			resetDatabase( 'tests', config )
				.then( () => configureWordPress( 'tests', config ) )
				.catch( () => {} )
		);
	}

	await Promise.all( tasks );

	spinner.text = `Cleaned ${ description }.`;
};
