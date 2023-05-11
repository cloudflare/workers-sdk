//small stub to include things in scope that emscripten needs to be happy.
//the 'web' target is the closest to the workers api
//(not the 'worker' target) so we have to add things like document
const document = this;
